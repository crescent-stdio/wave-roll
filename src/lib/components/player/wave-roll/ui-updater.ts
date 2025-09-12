import { StateManager } from "@/core/state";
import { VisualizationEngine } from "@/core/visualization";
import { UIComponentDependencies } from "@/lib/components/ui";
import { formatTime } from "@/core/utils";
import { UILayoutManager } from "@/lib/components/ui/layout-manager";
import { FileToggleManager } from "@/lib/components/ui/file/toggle-manager";
import { MultiMidiManager } from "@/lib/core/midi/multi-midi-manager";

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
   * Compute the effective total duration for UI (seekbar/time labels),
   * taking the maximum of MIDI duration and registered WAV duration,
   * and scaling by current playbackRate (tempo).
   */
  private computeEffectiveDuration(): number {
    const st = this.visualizationEngine.getState();
    if (!st) return 0;
    const pr = st.playbackRate ?? 100;
    const speed = pr / 100;
    const midiDuration = st.duration || 0;

    // Query global WAV registry for maximum buffer duration
    let wavMax = 0;
    try {
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ audioBuffer?: AudioBuffer }> } })._waveRollAudio;
      const files = api?.getFiles?.() || [];
      const durations = files.map((f) => f.audioBuffer?.duration || 0).filter((d) => d > 0);
      wavMax = durations.length > 0 ? Math.max(...durations) : 0;
    } catch {}

    const rawMax = Math.max(midiDuration, wavMax);
    return speed > 0 ? rawMax / speed : rawMax;
  }

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
        pianoRoll: this.visualizationEngine.getPianoRollInstance(),
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
        silenceDetector: null,
      };

      // After creation, convert seconds -> % once we know duration (tempo/WAV-aware).
      const durationSec = this.computeEffectiveDuration();
      if (durationSec > 0 && (loopPoints.a !== null || loopPoints.b !== null)) {
        uiDeps!.loopPoints = {
          a: loopPoints.a !== null ? (loopPoints.a / durationSec) * 100 : null,
          b: loopPoints.b !== null ? (loopPoints.b / durationSec) * 100 : null,
        };
      }
    } else {
      // Refresh dynamic fields
      uiDeps.midiManager = this.midiManager;
      uiDeps.audioPlayer = this.visualizationEngine;
      uiDeps.pianoRoll =
        this.visualizationEngine.getPianoRollInstance();
      uiDeps.stateManager = this.stateManager;
      uiDeps.filePanStateHandlers = filePanStateHandlersRef;
      uiDeps.filePanValues = filePanValuesRef;
      uiDeps.muteDueNoLR = uiState.muteDueNoLR;
      uiDeps.lastVolumeBeforeMute = uiState.lastVolumeBeforeMute;
      uiDeps.minorTimeStep = uiState.minorTimeStep;

      // Convert loopPoints (seconds) -> % for seek-bar visualisation (tempo/WAV-aware)
      const durationSec = this.computeEffectiveDuration();
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
        // Guard against invalid time values breaking UI updates
        if (!Number.isFinite(state.currentTime) || state.currentTime < 0) {
          state.currentTime = 0;
        }
        // Track when we see non-zero time
        if (state.currentTime > 0) {
          this.hasSeenNonZeroTime = true;
        }

        // Reset tracking when playback stops
        if (!state.isPlaying) {
          this.hasSeenNonZeroTime = false;
        }

        this.updatePianoRoll();

        // Always refresh seekbar/time using tempo-aware duration
        if (uiDeps?.updateSeekBar) {
          const effectiveDuration = this.computeEffectiveDuration();
          uiDeps.updateSeekBar({
            currentTime: state.currentTime,
            duration: effectiveDuration,
          });
        }
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
    // Avoid duplicate setTime during playback; Core engine drives playhead.
    const state = this.visualizationEngine.getState();
    if (!state?.isPlaying) {
      const pianoRollInstance = this.visualizationEngine.getPianoRollInstance();
      if (pianoRollInstance) {
        pianoRollInstance.setTime(state?.currentTime ?? 0);
      }
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
      if (!Number.isFinite(state.currentTime) || state.currentTime < 0) {
        state.currentTime = 0;
      }
      // Always pass explicit state to ensure seekbar is updated
      const effectiveDuration = this.computeEffectiveDuration();
      uiDeps.updateSeekBar({
        currentTime: state.currentTime,
        duration: effectiveDuration,
      });

      // Also ensure piano roll is synced when paused; skip while playing to
      // prevent redundant updates (Core engine already updates the playhead).
      if (!state.isPlaying) {
        const pianoRollInstance = this.visualizationEngine.getPianoRollInstance();
        if (pianoRollInstance) {
          const safeTime = Number.isFinite(state.currentTime) && state.currentTime >= 0 ? state.currentTime : 0;
          pianoRollInstance.setTime(safeTime);
        }
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
  private async openSettingsModal(deps: UIComponentDependencies | null): Promise<void> {
    if (deps) {
      const { openSettingsModal } = await import("@/lib/components/ui/settings/modal");
      openSettingsModal(deps);
    }
  }

  /**
   * Open evaluation results modal
   */
  private async openEvaluationResultsModal(deps: UIComponentDependencies | null): Promise<void> {
    if (deps) {
      const { openEvaluationResultsModal } = await import("@/lib/components/ui/settings/modal/evaluation-results");
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
