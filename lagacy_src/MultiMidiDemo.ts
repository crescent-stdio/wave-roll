/**
 * MultiMidiDemo - Orchestrator for multiple MIDI files with visualization
 * Refactored to use extracted modules and act as a coordination layer
 */

import { PlayerDemo, PlayerDemoOptions } from "./PlayerDemo";
import { MultiMidiManager, MidiFileEntry } from "./MultiMidiManager";
import { NoteData, ParsedMidi } from "src/lib/types";
import { createPianoRoll } from "@/components/piano-roll";
import {
  createAudioPlayer,
  AudioPlayerControls,
} from "@/components/audio-player";

// Import extracted modules
import {
  COLOR_PRIMARY,
  COLOR_A,
  COLOR_B,
  COLOR_OVERLAP,
  detectOverlappingNotes,
  rgbToHsv,
  hsvToRgb,
  blendColorsAverage,
} from "@/demos/multi-midi/ColorUtils";
import {
  StateManager,
  UIState,
  PlaybackState,
  FileVisibilityState,
  LoopPointsState,
  PanVolumeState,
} from "@/demos/multi-midi/StateManager";
import {
  FileManager,
  SampleFileConfig,
  DEFAULT_SAMPLE_FILES,
} from "@/demos/multi-midi/FileManager";
import {
  VisualizationEngine,
  PianoRollConfig,
  ColoredNote,
} from "@/demos/multi-midi/VisualizationEngine";
import {
  AudioController,
  AudioControllerConfig,
} from "@/demos/multi-midi/AudioController";
import {
  UILayoutManager,
  UIControlFactory,
  FileItemFactory,
  FileToggleManager,
  SettingsModalManager,
  UIUtils,
  UIComponentDependencies,
  UIElements,
} from "@/components/multi-midi";

/**
 * Configuration for MultiMidiDemo
 */
interface MultiMidiDemoConfig {
  audioController: AudioControllerConfig;
  pianoRoll: PianoRollConfig;
  ui: {
    sidebarWidth: number;
    minHeight: number;
    updateInterval: number;
  };
}

/**
 * Demo for multiple MIDI files - Acts as orchestrator for extracted modules
 */
export class MultiMidiDemo {
  private container: HTMLElement;
  private midiManager: MultiMidiManager;
  private playerDemo: PlayerDemo | null = null;

  // Extracted modules
  private stateManager!: StateManager;
  private fileManager!: FileManager;
  private visualizationEngine!: VisualizationEngine;
  private audioController!: AudioController;

  // UI containers
  private mainContainer!: HTMLElement;
  private sidebarContainer!: HTMLElement;
  private playerContainer!: HTMLElement;
  private controlsContainer!: HTMLElement;
  private timeDisplay!: HTMLElement;

  // UI elements maintained for backward compatibility
  private progressBar: HTMLElement | null = null;
  private seekHandle: HTMLElement | null = null;
  private currentTimeLabel: HTMLElement | null = null;
  private totalTimeLabel: HTMLElement | null = null;
  private seekBarContainer: HTMLElement | null = null;
  private loopRegion: HTMLElement | null = null;
  private markerA: HTMLElement | null = null;
  private markerB: HTMLElement | null = null;
  private progressIndicator: HTMLElement | null = null;
  private markerATimeLabel: HTMLElement | null = null;
  private markerBTimeLabel: HTMLElement | null = null;
  private zoomInput: HTMLInputElement | null = null;
  private fileToggleContainer: HTMLElement | null = null;

  // Piano roll container for visualization
  private pianoRollContainer!: HTMLElement;

  // Configuration
  private config: MultiMidiDemoConfig;

  // Store initial files for initialization
  private initialFiles: Array<{ path: string; displayName?: string }> = [];

  // Cached UI dependencies object so that UIComponents can write on it and we can read back
  private uiDeps: UIComponentDependencies | null = null;

  // Prevent rapid toggle issues
  private isTogglingPlayback = false;

  constructor(
    container: HTMLElement,
    initialFiles: Array<{ path: string; displayName?: string }> = []
  ) {
    this.container = container;
    this.midiManager = new MultiMidiManager();
    this.initialFiles = initialFiles;

    // Initialize configuration
    this.config = this.createDefaultConfig();

    // Create UI containers
    this.createUIContainers();

    // Initialize modules
    this.initializeModules();
  }

  /**
   * Create default configuration
   */
  private createDefaultConfig(): MultiMidiDemoConfig {
    return {
      audioController: {
        defaultVolume: 0.7,
        defaultTempo: 120,
        minTempo: 50,
        maxTempo: 200,
        updateInterval: 50,
      },
      pianoRoll: {
        width: 800,
        height: 400,
        backgroundColor: 0xf8f9fa,
        playheadColor: 0xff0000,
        showPianoKeys: true,
        noteRange: { min: 21, max: 108 },
        minorTimeStep: 0.1,
      },
      ui: {
        sidebarWidth: 280,
        minHeight: 600,
        updateInterval: 50,
      },
    };
  }

  /**
   * Create UI containers
   */
  private createUIContainers(): void {
    this.mainContainer = document.createElement("div");
    this.sidebarContainer = document.createElement("div");
    this.playerContainer = document.createElement("div");
    this.controlsContainer = document.createElement("div");
    this.timeDisplay = document.createElement("div");

    // Piano roll container will be attached to the player area later
    this.pianoRollContainer = document.createElement("div");
  }

  /**
   * Initialize all modules
   */
  private initializeModules(): void {
    // Initialize state manager
    this.stateManager = new StateManager();

    // Initialize file manager
    this.fileManager = new FileManager(this.midiManager);

    // Initialize visualization engine
    this.visualizationEngine = new VisualizationEngine({
      defaultPianoRollConfig: this.config.pianoRoll,
    });

    // Keep seek bar and time display tightly synced with the engine's visual updates.
    this.visualizationEngine.onVisualUpdate(({ currentTime, duration }) => {
      this.uiDeps?.updateSeekBar?.({ currentTime, duration } as any);
      this.updateTimeDisplay(currentTime);
    });

    // Initialize audio controller
    this.audioController = new AudioController(
      this.stateManager,
      this.config.audioController
    );

    // Set up state change listener
    this.midiManager.setOnStateChange(() => {
      if (this.stateManager.getUIState().isBatchLoading) return;
      this.updateVisualization();
      this.updateSidebar();
      this.updateFileToggleSection();
    });

    // Register global keyboard listener (Space → Play/Pause) only once
    const GLOBAL_KEY = "_waveRollSpaceHandler" as const;
    if (!(window as any)[GLOBAL_KEY]) {
      (window as any)[GLOBAL_KEY] = this.handleKeyDown.bind(this);
      document.addEventListener("keydown", (window as any)[GLOBAL_KEY]);
    }
  }

  /**
   * Get UI dependencies object for UIComponents
   */
  private getUIDependencies(): UIComponentDependencies {
    const uiState = this.stateManager.getUIState();
    const playbackState = this.stateManager.getPlaybackState();
    const loopPoints = this.stateManager.getLoopPointsState();
    const panVolumeState = this.stateManager.getPanVolumeState();

    // Use direct references so that UI mutations persist across re-renders
    const filePanValuesRef = this.stateManager.getFilePanValuesRef();
    const filePanStateHandlersRef =
      this.stateManager.getFilePanStateHandlersRef();

    // Reuse existing object so that mutations done by UIComponents persist
    if (!this.uiDeps) {
      this.uiDeps = {
        midiManager: this.midiManager,
        audioPlayer: this.visualizationEngine,
        pianoRollInstance: this.visualizationEngine.getPianoRollInstance(),
        filePanStateHandlers: filePanStateHandlersRef,
        filePanValues: filePanValuesRef,
        muteDueNoLR: uiState.muteDueNoLR,
        lastVolumeBeforeMute: uiState.lastVolumeBeforeMute,
        minorTimeStep: uiState.minorTimeStep,
        loopPoints: loopPoints,
        seeking: uiState.seeking,
        updateSeekBar: () => this.updateSeekBar(),
        updatePlayButton: () => this.updatePlayButton(),
        updateMuteState: (shouldMute: boolean) =>
          this.updateMuteState(shouldMute),
        openSettingsModal: () => this.openSettingsModal(),
        formatTime: (seconds: number) => UIUtils.formatTime(seconds),
      };
    } else {
      // Refresh dynamic fields
      this.uiDeps.midiManager = this.midiManager;
      this.uiDeps.audioPlayer = this.visualizationEngine;
      this.uiDeps.pianoRollInstance =
        this.visualizationEngine.getPianoRollInstance();
      this.uiDeps.filePanStateHandlers = filePanStateHandlersRef;
      this.uiDeps.filePanValues = filePanValuesRef;
      this.uiDeps.muteDueNoLR = uiState.muteDueNoLR;
      this.uiDeps.lastVolumeBeforeMute = uiState.lastVolumeBeforeMute;
      this.uiDeps.minorTimeStep = uiState.minorTimeStep;
      this.uiDeps.loopPoints = loopPoints;
      this.uiDeps.seeking = uiState.seeking;
    }

    return this.uiDeps;
  }

  /**
   * Get UI elements object for UIComponents
   */
  private getUIElements(): UIElements {
    return {
      mainContainer: this.mainContainer,
      sidebarContainer: this.sidebarContainer,
      playerContainer: this.playerContainer,
      controlsContainer: this.controlsContainer,
      timeDisplay: this.timeDisplay,
      progressBar: this.progressBar,
      seekHandle: this.seekHandle,
      currentTimeLabel: this.currentTimeLabel,
      totalTimeLabel: this.totalTimeLabel,
      seekBarContainer: this.seekBarContainer,
      loopRegion: this.loopRegion,
      markerA: this.markerA,
      markerB: this.markerB,
      progressIndicator: this.progressIndicator,
      markerATimeLabel: this.markerATimeLabel,
      markerBTimeLabel: this.markerBTimeLabel,
      zoomInput: this.zoomInput,
      fileToggleContainer: this.fileToggleContainer,
    };
  }

  /**
   * Initialize the demo
   */
  public async initialize(): Promise<void> {
    // Set up layout
    this.setupLayout();

    // Initialise empty piano-roll so the container is registered before data loads
    await this.visualizationEngine.initializePianoRoll(
      this.pianoRollContainer,
      [],
      this.config.pianoRoll
    );

    // Load initial files
    if (this.initialFiles && this.initialFiles.length > 0) {
      await this.loadSampleFiles(this.initialFiles);
    } else {
      await this.loadSampleFiles();
    }
  }

  /**
   * Set up the main layout
   */
  private setupLayout(): void {
    UILayoutManager.setupLayout(
      this.container,
      this.getUIElements(),
      this.getUIDependencies()
    );

    // Set up sidebar
    this.setupSidebar();

    // Attach piano-roll area to the player container (above the controls)
    this.pianoRollContainer.style.cssText = `
      width: 100%;
      height: 400px;
      margin-bottom: 12px;
    `;
    this.playerContainer.appendChild(this.pianoRollContainer);

    // Build playback & transport controls
    UIControlFactory.setupUI(
      this.controlsContainer,
      this.playerContainer,
      this.getUIDependencies()
    );

    // Set up file toggle section (below controls)
    this.setupFileToggleSection();

    // Start update loop
    // this.startUpdateLoop();
  }

  /**
   * Set up the sidebar
   */
  private setupSidebar(): void {
    UILayoutManager.setupSidebar(
      this.sidebarContainer,
      this.getUIDependencies()
    );
  }

  /**
   * Update sidebar with current files
   */
  private updateSidebar(): void {
    UILayoutManager.updateSidebar(this.sidebarContainer, this.midiManager);
  }

  /**
   * Load sample MIDI files
   */
  private async loadSampleFiles(
    files: Array<{ path: string; displayName?: string }> = []
  ): Promise<void> {
    this.stateManager.updateUIState({ isBatchLoading: true });

    const fileList = files.length > 0 ? files : DEFAULT_SAMPLE_FILES;

    try {
      await this.fileManager.loadSampleFiles(fileList);
    } catch (error) {
      console.error("Error loading sample files:", error);
    } finally {
      this.stateManager.updateUIState({ isBatchLoading: false });
      this.updateVisualization();
      this.updateSidebar();
      this.updateFileToggleSection();
    }
  }

  /**
   * Update visualization
   */
  private updateVisualization(): void {
    const state = this.midiManager.getState();

    // Build notes for piano-roll (visible) and audio (all but muted)
    const coloredNotesVisible = this.getColoredNotes(state);

    const audioNotes: NoteData[] = [];
    state.files.forEach((file: any) => {
      if (file.parsedData && !file.isMuted) {
        audioNotes.push(...file.parsedData.notes);
      }
    });

    // Update visualization engine
    this.visualizationEngine.updateVisualization(
      coloredNotesVisible,
      audioNotes
    );
  }

  /**
   * Get colored notes from MIDI state
   */
  private getColoredNotes(state: any): ColoredNote[] {
    const notes: ColoredNote[] = [];
    const colors = [COLOR_PRIMARY, COLOR_A, COLOR_B];

    state.files.forEach((file: any, index: number) => {
      if (!file.isVisible || !file.parsedData || !file.parsedData.notes) {
        return;
      }

      // Prefer per-file assigned color; fallback to static palette
      const colorHex: number =
        typeof file.color === "number"
          ? file.color
          : colors[index % colors.length];

      file.parsedData.notes.forEach((note: any) => {
        notes.push({
          note,
          color: colorHex,
          fileId: file.id,
          isMuted: file.isMuted ?? false,
        });
      });
    });

    // Detect overlapping notes and apply overlap color
    const overlappingIndices = detectOverlappingNotes(notes);

    return notes.map((coloredNote, index) => {
      if (overlappingIndices.has(index)) {
        return {
          ...coloredNote,
          // color:
          //   typeof COLOR_OVERLAP === "string"
          //     ? parseInt(COLOR_OVERLAP.replace("#", ""), 16)
          //     : COLOR_OVERLAP,
        };
      }
      return coloredNote;
    });
  }

  /**
   * Set up file toggle section
   */
  private setupFileToggleSection(): void {
    this.fileToggleContainer = FileToggleManager.setupFileToggleSection(
      this.playerContainer,
      this.getUIDependencies()
    );
  }

  /**
   * Update file toggle section
   */
  private updateFileToggleSection(): void {
    if (!this.fileToggleContainer) return;

    FileToggleManager.updateFileToggleSection(
      this.fileToggleContainer,
      this.getUIDependencies()
    );
  }

  /**
   * Start the update loop for UI synchronization
   */
  private startUpdateLoop(): void {
    const updateInterval = this.config.ui.updateInterval;

    const updateLoop = () => {
      // Keep UI dependency in sync with current visualization engine so
      // updateSeekBar always queries the live audioPlayer instance.
      if (this.uiDeps) {
        this.uiDeps.audioPlayer = this.visualizationEngine;
      }
      this.updateSeekBar();
      this.updateTimeDisplay();
      // Keep play/pause button icon in sync with actual playback state
      if (
        this.uiDeps?.updatePlayButton &&
        typeof this.uiDeps.updatePlayButton === "function"
      ) {
        this.uiDeps.updatePlayButton();
      }
    };

    const loopId = setInterval(updateLoop, updateInterval) as unknown as number;
    this.stateManager.updateUIState({ updateLoopId: loopId });
  }

  /**
   * Update seek bar
   */
  private updateSeekBar(): void {
    // Forward the freshest playhead information to the UI. If the
    // VisualizationEngine has recreated its underlying AudioPlayer, we may
    // hold a stale reference inside `uiDeps`. Therefore we *always* query the
    // engine directly and pass the data as an override so that the seek-bar
    // remains perfectly in-sync without relying on periodic mutation loops.
    if (
      !this.uiDeps?.updateSeekBar ||
      typeof this.uiDeps.updateSeekBar !== "function"
    ) {
      return;
    }

    const state = this.visualizationEngine.getState();
    if (state) {
      this.uiDeps.updateSeekBar({
        currentTime: state.currentTime,
        duration: state.duration,
      } as any);
    } else {
      // Fallback to existing logic if state is unavailable (e.g., before first load)
      this.uiDeps.updateSeekBar();
    }
  }

  /**
   * Update play button
   */
  private updatePlayButton(): void {
    // Always obtain the freshest dependency object so that audioPlayer reference
    // is up-to-date even if the update loop hasn't run yet.
    const deps = this.getUIDependencies();
    deps.updatePlayButton?.();
    // Immediately refresh progress bar to reflect the latest playback position
    deps.updateSeekBar?.();
    // Debounce window before next toggle
    setTimeout(() => {
      this.isTogglingPlayback = false;
    }, 100);
  }

  /**
   * Update time display
   */
  private updateTimeDisplay(overrideTime?: number): void {
    const seconds =
      overrideTime !== undefined
        ? overrideTime
        : this.stateManager.getPlaybackState().currentTime;
    this.timeDisplay.textContent = UIUtils.formatTime(seconds);
  }

  /**
   * Update mute state
   */
  private updateMuteState(shouldMute: boolean): void {
    this.audioController.handleChannelMute(shouldMute);
  }

  /**
   * Open settings modal
   */
  private openSettingsModal(): void {
    SettingsModalManager.openSettingsModal(this.getUIDependencies());
  }

  /**
   * Setup keyboard listener
   */
  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return; // Ignore auto-repeat

    // Debug: Log keydown details and current engine state
    const _debugState = this.visualizationEngine.getState();
    console.log("[MultiMidiDemo] KeyDown", {
      key: event.key,
      code: event.code,
      isTogglingPlayback: this.isTogglingPlayback,
      isPlaying: _debugState?.isPlaying,
    });

    if (event.code === "Space" || event.key === " ") {
      // Skip if focus is on interactive element that handles Space (inputs, buttons, links etc.)
      const target = event.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLAnchorElement ||
        target?.getAttribute("role") === "button" ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      // Prevent rapid toggling
      if (this.isTogglingPlayback) {
        return;
      }

      this.isTogglingPlayback = true;

      // Toggle playback state directly to avoid relying on a synthetic click() which
      // did not refresh the icon correctly in some browsers.
      const playerState = this.visualizationEngine.getState();

      const finishToggle = () => {
        // Always obtain the freshest dependency object so that audioPlayer reference
        // is up-to-date even if the update loop hasn't run yet.
        const deps = this.getUIDependencies();
        deps.updatePlayButton?.();
        // Immediately refresh progress bar to reflect the latest playback position
        deps.updateSeekBar?.();
        // Debounce window before next toggle
        setTimeout(() => {
          this.isTogglingPlayback = false;
        }, 100);
      };

      if (playerState?.isPlaying) {
        // Currently playing → pause
        this.visualizationEngine.pause();
        finishToggle();
      } else {
        // Currently paused → play (async)
        this.visualizationEngine
          .play()
          .catch((err) =>
            console.error("Failed to start playback via Space:", err)
          )
          .finally(() => {
            finishToggle();
          });
      }
    }
  };

  /**
   * Cleanup resources
   */
  public dispose(): void {
    // Stop update loop
    const uiState = this.stateManager.getUIState();
    if (uiState.updateLoopId) {
      clearInterval(uiState.updateLoopId);
    }

    // Remove global keyboard listener if it belongs to this instance
    const GLOBAL_KEY = "_waveRollSpaceHandler" as const;
    const handler = (window as any)[GLOBAL_KEY];
    if (handler && handler === this.handleKeyDown.bind(this)) {
      document.removeEventListener("keydown", handler);
      delete (window as any)[GLOBAL_KEY];
    }

    // Dispose modules
    this.visualizationEngine.destroy();
    this.audioController.destroy();
    // StateManager doesn't have a dispose method
  }
}

/**
 * Factory function to create multi MIDI demo
 */
export async function createMultiMidiDemo(
  container: HTMLElement,
  files: Array<{ path: string; displayName?: string }> = []
): Promise<MultiMidiDemo> {
  const demo = new MultiMidiDemo(container, files);
  await demo.initialize();
  return demo;
}
