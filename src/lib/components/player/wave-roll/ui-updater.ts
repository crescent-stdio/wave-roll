import { StateManager } from "@/core/state";
import { VisualizationEngine } from "@/core/visualization";
import { UIComponentDependencies } from "@/lib/components/ui";
import { formatTime } from "@/core/utils";
import { UILayoutManager } from "@/lib/components/ui/layout-manager";
import { FileToggleManager } from "@/lib/components/ui/file/toggle-manager";
import { MultiMidiManager } from "@/lib/core/midi/multi-midi-manager";
import { openSettingsModal } from "@/lib/components/ui/settings/modal";
import { openEvaluationResultsModal } from "@/lib/components/ui/settings/modal/evaluation-results";

export class UIUpdater {
  private updateLoopId: number | null = null;
  private hasSeenNonZeroTime = false;

  constructor(
    private stateManager: StateManager,
    private visualizationEngine: VisualizationEngine,
    private midiManager: MultiMidiManager,
    private config: { updateInterval: number }
  ) {}

  /**
   * Get UI dependencies object for UIComponents
   */
  getUIDependencies(uiDeps: UIComponentDependencies | null): UIComponentDependencies {
    const uiState = this.stateManager.getUIState();
    const playbackState = this.stateManager.getState().playback;
    const loopPoints = this.stateManager.getState().loopPoints;

    // Use direct references so that UI mutations persist across re-renders
    const filePanValuesRef = this.stateManager.getFilePanValuesRef();
    const filePanStateHandlersRef =
      this.stateManager.getFilePanStateHandlersRef();

    // Reuse existing object so that mutations done by UIComponents persist
    if (!uiDeps) {
      uiDeps = {
        midiManager: this.midiManager,
        audioPlayer: this.visualizationEngine,
        pianoRoll: this.visualizationEngine.getPianoRollInstance() as any,
        stateManager: this.stateManager,
        filePanStateHandlers: filePanStateHandlersRef,
        filePanValues: filePanValuesRef,
        muteDueNoLR: uiState.muteDueNoLR,
        lastVolumeBeforeMute: uiState.lastVolumeBeforeMute,
        minorTimeStep: uiState.minorTimeStep,
        loopPoints: null,
        seeking: uiState.seeking,
        updateSeekBar: () => this.updateSeekBar(uiDeps),
        updatePlayButton: () => this.updatePlayButton(uiDeps),
        updateMuteState: (shouldMute: boolean) =>
          this.updateMuteState(shouldMute),
        openSettingsModal: () => this.openSettingsModal(uiDeps),
        openEvaluationResultsModal: () => this.openEvaluationResultsModal(uiDeps),
        formatTime: (seconds: number) => formatTime(seconds),
      };

      // After creation, convert seconds -> % once we know duration.
      const durationSec = playbackState.duration;
      if (durationSec > 0 && (loopPoints.a !== null || loopPoints.b !== null)) {
        uiDeps.loopPoints = {
          a: loopPoints.a !== null ? (loopPoints.a / durationSec) * 100 : null,
          b: loopPoints.b !== null ? (loopPoints.b / durationSec) * 100 : null,
        };
      }
    } else {
      // Refresh dynamic fields
      uiDeps.midiManager = this.midiManager;
      uiDeps.audioPlayer = this.visualizationEngine;
      uiDeps.pianoRoll =
        this.visualizationEngine.getPianoRollInstance() as any;
      uiDeps.stateManager = this.stateManager;
      uiDeps.filePanStateHandlers = filePanStateHandlersRef;
      uiDeps.filePanValues = filePanValuesRef;
      uiDeps.muteDueNoLR = uiState.muteDueNoLR;
      uiDeps.lastVolumeBeforeMute = uiState.lastVolumeBeforeMute;
      uiDeps.minorTimeStep = uiState.minorTimeStep;

      // Convert loopPoints (seconds) -> % for seek-bar visualisation
      const durationSec = playbackState.duration;
      if (durationSec > 0 && (loopPoints.a !== null || loopPoints.b !== null)) {
        uiDeps.loopPoints = {
          a: loopPoints.a !== null ? (loopPoints.a / durationSec) * 100 : null,
          b: loopPoints.b !== null ? (loopPoints.b / durationSec) * 100 : null,
        };
      }
      uiDeps.seeking = uiState.seeking;
    }

    return uiDeps as UIComponentDependencies;
  }

  /**
   * Start the update loop for UI synchronization
   */
  startUpdateLoop(uiDeps: UIComponentDependencies | null): void {
    const updateInterval = this.config.updateInterval;

    const updateLoop = () => {
      // Keep UI dependency in sync with current visualization engine so
      // updateSeekBar always queries the live audioPlayer instance.
      if (uiDeps) {
        uiDeps.audioPlayer = this.visualizationEngine;
      }

      // Get current state from visualization engine
      const state = this.visualizationEngine.getState();
      if (state) {
        // Track when we see non-zero time
        if (state.currentTime > 0) {
          this.hasSeenNonZeroTime = true;
        }

        // Skip redundant 0-second frames that occur immediately after
        // playback starts.
        if (state.isPlaying && state.currentTime === 0 && !this.hasSeenNonZeroTime) {
          return;
        }

        // Reset tracking when playback stops
        if (!state.isPlaying) {
          this.hasSeenNonZeroTime = false;
        }

        this.updatePianoRoll();

        // Update seek bar with current state
        if (uiDeps?.updateSeekBar) {
          uiDeps.updateSeekBar({
            currentTime: state.currentTime,
            duration: state.duration,
          } as any);
        }

        // Update time display
        this.updateTimeDisplay(state.currentTime);
      } else {
        // Fallback if state is not available
        this.updateSeekBar(uiDeps);
        this.updateTimeDisplay();
      }

      // Keep play/pause button icon in sync with actual playback state
      if (
        uiDeps?.updatePlayButton &&
        typeof uiDeps.updatePlayButton === "function"
      ) {
        uiDeps.updatePlayButton();
      }
    };

    // Perform immediate update to avoid initial delay
    updateLoop();

    // Clear any existing update loop before starting new one
    const existingLoopId = this.stateManager.getUIState().updateLoopId;
    if (existingLoopId) {
      clearInterval(existingLoopId);
    }

    const loopId = setInterval(updateLoop, updateInterval) as unknown as number;
    this.stateManager.updateUIState({ updateLoopId: loopId });
    this.updateLoopId = loopId;
  }

  /**
   * Stop update loop
   */
  stopUpdateLoop(): void {
    if (this.updateLoopId) {
      clearInterval(this.updateLoopId);
      this.updateLoopId = null;
    }
  }

  /**
   * Update piano roll
   */
  private updatePianoRoll(): void {
    const pianoRollInstance = this.visualizationEngine.getPianoRollInstance();
    if (pianoRollInstance) {
      pianoRollInstance.setTime(
        this.visualizationEngine.getState().currentTime
      );
    }
  }

  /**
   * Update seek bar
   */
  updateSeekBar(uiDeps: UIComponentDependencies | null): void {
    if (
      !uiDeps?.updateSeekBar ||
      typeof uiDeps.updateSeekBar !== "function"
    ) {
      return;
    }

    const state = this.visualizationEngine.getState();
    if (state) {
      // Always pass explicit state to ensure seekbar is updated
      uiDeps.updateSeekBar({
        currentTime: state.currentTime,
        duration: state.duration,
      } as any);

      // Also ensure piano roll is synced
      const pianoRollInstance = this.visualizationEngine.getPianoRollInstance();
      if (pianoRollInstance) {
        pianoRollInstance.setTime(state.currentTime);
      }
    } else {
      // Fallback to existing logic if state is unavailable
      uiDeps.updateSeekBar();
    }
  }

  /**
   * Update play button
   */
  updatePlayButton(deps: UIComponentDependencies | null): void {
    deps?.updatePlayButton?.();
    // Immediately refresh progress bar to reflect the latest playback position
    deps?.updateSeekBar?.();
  }

  /**
   * Update time display
   */
  updateTimeDisplay(overrideTime?: number, timeDisplay?: HTMLElement): void {
    const seconds =
      overrideTime !== undefined
        ? overrideTime
        : this.stateManager.getState().playback.currentTime;

    if (timeDisplay) {
      timeDisplay.textContent = formatTime(seconds);
    }
  }

  /**
   * Update mute state
   */
  private updateMuteState(shouldMute: boolean): void {
    // This would be handled by the main player class
    // as it needs access to the corePlaybackEngine
  }

  /**
   * Open settings modal
   */
  private openSettingsModal(deps: UIComponentDependencies | null): void {
    if (deps) {
      openSettingsModal(deps);
    }
  }

  /**
   * Open evaluation results modal
   */
  private openEvaluationResultsModal(deps: UIComponentDependencies | null): void {
    if (deps) {
      openEvaluationResultsModal(deps);
    }
  }

  /**
   * Update sidebar with current files
   */
  updateSidebar(sidebarContainer: HTMLElement): void {
    UILayoutManager.updateSidebar(sidebarContainer, this.midiManager);
  }

  /**
   * Update file toggle section
   */
  updateFileToggleSection(
    fileToggleContainer: HTMLElement | null,
    deps: UIComponentDependencies
  ): void {
    if (!fileToggleContainer) return;

    FileToggleManager.updateFileToggleSection(fileToggleContainer, deps);
  }
}