/**
 * WaveRollPlayer - an integrated Audio + Piano-roll component.
 *
 * * Responsibilities*
 *   1. Build AudioPlayer + PianoRoll core objects.
 *   2. Compose UI controls (playback, loop, volume, tempo, …).
 *   3. Maintain a lightweight update-loop to keep UI <-> audio <-> piano-roll in sync.
 *
 * The class itself **owns no UI-implementation details**: every visual control
 * is imported from `lib/components/ui/**`. That keeps the orchestration layer
 * small and easy to test.
 */
import { NoteData, ControlChangeEvent } from "@/lib/midi/types";
import { MultiMidiManager } from "@/lib/core/midi/multi-midi-manager";
import { MidiFileItemList } from "@/lib/core/file/types";
import { WaveRollPlayerOptions } from "./types";
import {
  createDefaultConfig,
  setupLayout,
  setupFileToggleSection,
} from "./layout";
import {
  VisualizationEngine,
  DEFAULT_PIANO_ROLL_CONFIG,
} from "@/core/visualization";
import { StateManager } from "@/core/state";
import { FileManager } from "@/core/file";
import { UIComponentDependencies, UIElements } from "@/lib/components/ui";
import { formatTime } from "@/core/utils";
import { ensureThemeStylesInjected } from "@/lib/components/ui/theme";
import { UILayoutManager } from "@/lib/components/ui/layout-manager";
import { FileToggleManager } from "@/lib/components/ui/file/toggle-manager";
import { setupUI } from "@/lib/components/ui/controls";
import { AudioPlayerContainer } from "@/core/audio";
import {
  CorePlaybackEngine,
  createCorePlaybackEngine,
  createPianoRollManager,
  PianoRollConfig,
  PianoRollManager,
} from "@/core/playback";
import {
  computeNoteMetrics,
  DEFAULT_TOLERANCES,
} from "@/lib/evaluation/transcription";
import { DEFAULT_SAMPLE_FILES } from "@/core/file/constants";

// Import new handler modules
import { VisualizationHandler } from "./visualization-handler";
import { UIUpdater } from "./ui-updater";
import { KeyboardHandler } from "./keyboard-handler";
import { FileLoader } from "./file-loader";
import { SilenceDetector } from "@/core/playback";

/**
 * Demo for multiple MIDI files - Acts as orchestrator for extracted modules
 */
export class WaveRollPlayer {
  private container: HTMLElement;
  private midiManager: MultiMidiManager;
  public pianoRollManager: PianoRollManager | null = null;
  private corePlaybackEngine: CorePlaybackEngine | null = null;

  // Extracted modules
  private stateManager!: StateManager;
  private fileManager!: FileManager;
  private visualizationEngine!: VisualizationEngine;

  // UI containers
  private audioPlayerContainer: AudioPlayerContainer | null = null;
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
  private config: WaveRollPlayerOptions;

  // Store initial files for initialization
  private initialFileItemList: Array<{
    path: string;
    displayName?: string;
    type?: "midi" | "audio";
  }> = [];

  // Cached UI dependencies object so that UIComponents can write on it and we can read back
  private uiDeps: UIComponentDependencies | null = null;

  // Handler modules
  private visualizationHandler!: VisualizationHandler;
  private uiUpdater!: UIUpdater;
  private keyboardHandler!: KeyboardHandler;
  private fileLoader!: FileLoader;
  private silenceDetector!: SilenceDetector;
  private pausedBySilence: boolean = false;

  constructor(
    container: HTMLElement,
    initialFileItemList: Array<{
      path: string;
      displayName?: string;
      type?: "midi" | "audio";
    }> = []
  ) {
    this.container = container;
    this.midiManager = new MultiMidiManager();
    this.initialFileItemList = initialFileItemList;

    // Initialize configuration
    this.config = createDefaultConfig();

    // Inject accessible theme variables and focus styles once
    ensureThemeStylesInjected();

    // Create UI containers
    this.createUIContainers();

    // Initialize modules
    this.initializeModules();
  }

  /**
   * Create default configuration
   */

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
    this.fileManager = new FileManager(this.midiManager, this.stateManager);

    // Merge provided overrides with mandatory defaults to satisfy strict typing
    const pianoRollConfig: PianoRollConfig = {
      ...DEFAULT_PIANO_ROLL_CONFIG,
      ...this.config.pianoRoll,
    } as PianoRollConfig;

    // Initialize visualization engine with resolved piano-roll configuration
    this.visualizationEngine = new VisualizationEngine({
      defaultPianoRollConfig: pianoRollConfig,
      updateInterval: this.config.ui.updateInterval, // Sync interval
      enableOverlapDetection: false, // We handle overlap coloring manually
    });

    // Keep seek bar and time display tightly synced with the engine's visual updates.
    this.visualizationEngine.onVisualUpdate(({ currentTime, duration }) => {
      // Always get fresh dependencies to ensure updateSeekBar is available
      const deps = this.getUIDependencies();
      deps.updateSeekBar?.({ currentTime, duration } as any);
      this.updateTimeDisplay(currentTime);

      // NEW: keep piano-roll playhead in perfect sync with audio
      const piano = this.visualizationEngine.getPianoRollInstance();
      piano?.setTime(currentTime);
    });

    this.pianoRollManager = createPianoRollManager();
    this.pianoRollManager.initialize(this.pianoRollContainer, []);

    const coreEngine = createCorePlaybackEngine(this.stateManager);
    coreEngine.initialize(this.pianoRollManager);

    this.corePlaybackEngine = coreEngine;

    // Handlers are created below; listeners will be attached afterwards

    // Initialize silence detector for auto-pause functionality
    this.silenceDetector = new SilenceDetector({
      autoResumeOnUnmute: false,
      onSilenceDetected: () => {
        // Auto-pause when all sources are silent
        if (this.corePlaybackEngine?.getState().isPlaying) {
          console.log("Auto-pausing: all sources are silent");
          this.pausedBySilence = true;
          this.corePlaybackEngine.pause();
          // Update play button UI to reflect paused state
          this.updatePlayButton();
        }
      },
      onSoundDetected: () => {
        // 요구사항: 사용자가 재생 버튼을 눌러야 재개됨 (자동 재개 금지)
        this.pausedBySilence = false;
        console.log("Sound detected");
      }
    });

    // Initialize handler modules
    this.visualizationHandler = new VisualizationHandler(
      this.midiManager,
      this.stateManager,
      this.visualizationEngine
    );
    
    this.uiUpdater = new UIUpdater(
      this.stateManager,
      this.visualizationEngine,
      this.midiManager,
      { updateInterval: this.config.ui.updateInterval }
    );
    this.keyboardHandler = new KeyboardHandler();
    this.fileLoader = new FileLoader(this.stateManager, this.fileManager);

    // Setup keyboard listener
    this.keyboardHandler.setupKeyboardListener(
      () => this.getUIDependencies(),
      () => this.startUpdateLoop()
    );

    // Track previous mute states to detect changes
    const previousMuteStates = new Map<string, boolean>();
    
    // Now that handlers are ready, set up state change listeners
    this.midiManager.setOnStateChange(() => {
      if (this.stateManager.getUIState().isBatchLoading) return;
      
      // Check for mute state changes and apply them via setFileMute
      const state = this.midiManager.getState();
      state.files.forEach((file: any) => {
        const prevMute = previousMuteStates.get(file.id) || false;
        const currMute = file.isMuted || false;
        
        if (prevMute !== currMute && this.corePlaybackEngine) {
          // Apply mute change without recreating the audio player
          this.corePlaybackEngine.setFileMute(file.id, currMute);
          previousMuteStates.set(file.id, currMute);
        }
      });
      
      // Check if all sources are silent and auto-pause if needed
      if (this.silenceDetector) {
        this.silenceDetector.checkSilence(this.midiManager);
      }
      
      this.updateVisualization();
      this.updateSidebar();
      this.updateFileToggleSection();
    });

    // React to visual state changes such as highlight-mode updates
    this.stateManager.onStateChange(() => {
      if (this.stateManager.getUIState().isBatchLoading) return;
      this.updateVisualization();
    });
  }

  /**
   * Get UI dependencies object for UIComponents
   */
  private getUIDependencies(): UIComponentDependencies {
    const uiState = this.stateManager.getUIState();
    const playbackState = this.stateManager.getState().playback;
    const loopPoints = this.stateManager.getState().loopPoints;
    const panVolumeState = this.stateManager.getState().panVolume;

    // Use direct references so that UI mutations persist across re-renders
    const filePanValuesRef = this.stateManager.getFilePanValuesRef();
    const filePanStateHandlersRef =
      this.stateManager.getFilePanStateHandlersRef();

    // Reuse existing object so that mutations done by UIComponents persist
    if (!this.uiDeps) {
      this.uiDeps = {
        midiManager: this.midiManager,
        // Use VisualizationEngine itself as the audio player proxy so that
        // keyboard shortcuts (Space bar), seek-bar, and other controls
        // interact with the actual underlying AudioPlayer instance managed
        // by the engine. This prevents “Audio player not initialized” errors
        // that occurred when the controls referenced the bare AudioController
        // before it had created its internal AudioPlayer.
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
        updateSeekBar: () => this.updateSeekBar(),
        updatePlayButton: () => this.updatePlayButton(),
        updateMuteState: (shouldMute: boolean) =>
          this.updateMuteState(shouldMute),
        openSettingsModal: () => this.openSettingsModal(),
        openEvaluationResultsModal: () => this.openEvaluationResultsModal(),
        formatTime: (seconds: number) => formatTime(seconds),
        silenceDetector: this.silenceDetector,
      };

      // After creation, convert seconds -> % once we know duration.
      const durationSec = playbackState.duration;
      if (durationSec > 0 && (loopPoints.a !== null || loopPoints.b !== null)) {
        this.uiDeps.loopPoints = {
          a: loopPoints.a !== null ? (loopPoints.a / durationSec) * 100 : null,
          b: loopPoints.b !== null ? (loopPoints.b / durationSec) * 100 : null,
        };
      }
    } else {
      // Refresh dynamic fields
      this.uiDeps.midiManager = this.midiManager;
      this.uiDeps.audioPlayer = this.visualizationEngine;
      this.uiDeps.pianoRoll =
        this.visualizationEngine.getPianoRollInstance() as any;
      this.uiDeps.stateManager = this.stateManager;
      this.uiDeps.filePanStateHandlers = filePanStateHandlersRef;
      this.uiDeps.filePanValues = filePanValuesRef;
      this.uiDeps.muteDueNoLR = uiState.muteDueNoLR;
      this.uiDeps.lastVolumeBeforeMute = uiState.lastVolumeBeforeMute;
      this.uiDeps.minorTimeStep = uiState.minorTimeStep;

      // Convert loopPoints (seconds) -> % for seek-bar visualisation
      const durationSec = playbackState.duration;
      if (durationSec > 0 && (loopPoints.a !== null || loopPoints.b !== null)) {
        this.uiDeps.loopPoints = {
          a: loopPoints.a !== null ? (loopPoints.a / durationSec) * 100 : null,
          b: loopPoints.b !== null ? (loopPoints.b / durationSec) * 100 : null,
        };
      }
      this.uiDeps.seeking = uiState.seeking;
    }

    return this.uiDeps as UIComponentDependencies;
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
    // 1) Build structural layout (sidebar, player area, placeholders).
    const uiElements = this.getUIElements();
    setupLayout(
      this.container,
      uiElements,
      this.getUIDependencies(),
      this.pianoRollContainer
    );

    // 2) Now that the piano-roll container is in the DOM, initialise the
    //    visualization engine so that `getPianoRollInstance()` returns a
    //    valid reference required by the transport controls.
    await this.visualizationEngine.initializePianoRoll(
      this.pianoRollContainer,
      [],
      this.config.pianoRoll
    );

    // 3) Build playback/transport controls **after** piano-roll + audio
    //    player are ready so that dependencies like `pianoRoll` exist.
    const depsReady = this.getUIDependencies();
    setupUI(
      uiElements.controlsContainer,
      uiElements.playerContainer,
      depsReady
    );

    /* ------------------------------------------------------------
     *  Listen for A-B loop changes coming from the loop controls
     *  and propagate them to the seek-bar overlay in real-time.
     * ---------------------------------------------------------- */
    uiElements.controlsContainer.addEventListener(
      "wr-loop-update",
      (e: Event) => {
        const { loopWindow } = (
          e as CustomEvent<{
            loopWindow: { prev: number | null; next: number | null } | null;
          }>
        ).detail;

        // Map to LoopPoints format expected by UI deps (percent-based)
        const lp = loopWindow
          ? { a: loopWindow.prev, b: loopWindow.next }
          : null;

        // Persist on the shared dependencies object so the seek-bar update
        // function can access the latest values.
        const deps = this.getUIDependencies();
        (deps as any).loopPoints = lp;

        // Force a seek-bar refresh immediately for snappy feedback.
        const state = this.visualizationEngine.getState();
        deps.updateSeekBar?.({
          currentTime: state.currentTime,
          duration: state.duration,
        } as any);
      }
    );

    // 4) File-visibility toggle section (below controls)
    this.fileToggleContainer = setupFileToggleSection(
      uiElements.playerContainer,
      depsReady
    );
    uiElements.fileToggleContainer = this.fileToggleContainer;

    // Load initial files if provided
    if (this.initialFileItemList.length > 0) {
      await this.loadSampleFiles(this.initialFileItemList);
    } else {
      // Don't load default files - just update UI to show empty state
      this.updateSidebar();
      this.updateFileToggleSection();
    }
    // console.log("this.midiManager.getState()", this.midiManager.getState());

    // Only compute metrics if we have at least 2 files
    const files = this.midiManager.getState().files;
    if (files.length >= 2) {
      const custom = { ...DEFAULT_TOLERANCES, onsetTolerance: 0.03 };
      const ref = files[0].parsedData;
      const est = files[1].parsedData;

      /*
       * Only compute metrics when both reference and estimated MIDI objects are
       * available. The `computeNoteMetrics` utility expects full `ParsedMidi`
       * objects, not just the `notes` arrays.
       */
      if (ref && est) {
        // console.log("computeNoteMetrics", computeNoteMetrics(ref, est, custom));
      }
    }
    // Kick-off continuous UI syncing (seek-bar, play button, etc.)
    // This used to be forgotten which meant the progress bar and icons
    // wouldn’t refresh when playback started via the keyboard.
    this.startUpdateLoop();
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
    this.uiUpdater.updateSidebar(this.sidebarContainer);
  }

  /**
   * Load sample MIDI files
   */
  private async loadSampleFiles(
    files: Array<{
      path: string;
      displayName?: string;
      type?: "midi" | "audio";
    }> = []
  ): Promise<void> {
    await this.fileLoader.loadSampleFiles(files, {
      onComplete: () => {
        this.updateVisualization();
        this.updateSidebar();
        this.updateFileToggleSection();
        
        // Initialize silence detector with all loaded files
        if (this.silenceDetector) {
          this.silenceDetector.checkSilence(this.midiManager);
        }
      },
    });
  }

  /**
   * Update visualization
   */
  private updateVisualization(): void {
    if (!this.visualizationHandler) {
      return;
    }
    this.visualizationHandler.updateVisualization();
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
    this.uiUpdater.updateFileToggleSection(
      this.fileToggleContainer,
      this.getUIDependencies()
    );
  }

  /**
   * Start the update loop for UI synchronization
   */
  private startUpdateLoop(): void {
    this.uiUpdater.startUpdateLoop(this.uiDeps);
  }
  /**
   * Update seek bar
   */
  private updateSeekBar(): void {
    this.uiUpdater.updateSeekBar(this.uiDeps);
  }

  /**
   * Update play button
   */
  private updatePlayButton(): void {
    const deps = this.getUIDependencies();
    this.uiUpdater.updatePlayButton(deps);
    this.keyboardHandler.resetTogglingState();
  }

  /**
   * Update time display
   */
  private updateTimeDisplay(overrideTime?: number): void {
    this.uiUpdater.updateTimeDisplay(overrideTime, this.timeDisplay);
  }

  /**
   * Update mute state
   */
  private updateMuteState(shouldMute: boolean): void {
    // this.audioController.handleChannelMute(shouldMute);
    this.corePlaybackEngine?.handleChannelMute(shouldMute);
  }

  /**
   * Open settings modal
   */
  private async openSettingsModal(): Promise<void> {
    const deps = this.getUIDependencies();
    if (deps) {
      const mod = await import("@/lib/components/ui/settings/modal");
      mod.openSettingsModal(deps);
    }
  }

  /**
   * Open evaluation results modal
   */
  private async openEvaluationResultsModal(): Promise<void> {
    const deps = this.getUIDependencies();
    if (deps) {
      const mod = await import(
        "@/lib/components/ui/settings/modal/evaluation-results"
      );
      mod.openEvaluationResultsModal(deps);
    }
  }

  /**
   * Cleanup resources
   */
  public dispose(): void {
    // Stop update loop
    const uiState = this.stateManager.getUIState();
    if (uiState.updateLoopId) {
      clearInterval(uiState.updateLoopId);
    }

    // Cleanup keyboard handler
    this.keyboardHandler.cleanup();

    // Dispose modules
    this.visualizationEngine.destroy();
    // this.audioController.destroy();
    this.corePlaybackEngine?.destroy();
    // StateManager doesn't have a dispose method
  }
}

/**
 * Factory function to create multi MIDI demo
 */
export async function createWaveRollPlayer(
  container: HTMLElement,
  files: Array<{ path: string; displayName?: string }> = []
): Promise<WaveRollPlayer> {
  const demo = new WaveRollPlayer(container, files);
  await demo.initialize();
  return demo;
}
