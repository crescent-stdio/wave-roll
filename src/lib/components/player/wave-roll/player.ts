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
import {
  WaveRollPlayerOptions,
  CreateWaveRollPlayerOptions,
  MidiExportOptions,
} from "./types";
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

// Import types and constants for appearance API
import type { OnsetMarkerStyle, OnsetMarkerShape } from "@/types";
import { ColorPalette } from "@/lib/core/midi/types";
import { DEFAULT_PALETTES } from "@/lib/core/midi/palette";
import { ONSET_MARKER_SHAPES } from "@/core/constants";
import { HighlightMode } from "@/core/state/types";

/**
 * Appearance settings structure for solo mode integration
 */
export interface AppearanceSettings {
  paletteId: string;
  noteColor?: number;
  onsetMarker?: {
    shape: OnsetMarkerShape;
    variant: "filled" | "outlined";
  };
}

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
    name?: string;
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
  private lastHookedAudioPlayer: any = null;
  private audioVisualHooked: boolean = false;

  // UI permissions (used to drive readonly behavior in UI components)
  private permissions: { canAddFiles: boolean; canRemoveFiles: boolean } = {
    canAddFiles: true,
    canRemoveFiles: true,
  };

  // Solo mode: hides evaluation UI, file sections, and waveform band
  private soloMode: boolean = false;

  // MIDI export options
  private midiExportOptions: MidiExportOptions | undefined;

  // Piano roll config overrides from options
  private pianoRollConfigOverrides: Partial<PianoRollConfig> = {};

  // File add request callbacks (for VS Code integration)
  private fileAddRequestCallback: (() => void) | null = null;
  private audioFileAddRequestCallback: (() => void) | null = null;
  private defaultHighlightMode: HighlightMode | undefined;

  // Compute effective UI duration considering tempo and WAV length
  private getEffectiveDuration(): number {
    try {
      const st = this.visualizationEngine.getState();
      const pr = st.playbackRate ?? 100;
      const speed = pr / 100;
      const midiDur = st.duration || 0;
      let wavMax = 0;
      try {
        const api = (
          globalThis as unknown as {
            _waveRollAudio?: {
              getFiles?: () => Array<{ audioBuffer?: AudioBuffer }>;
            };
          }
        )._waveRollAudio;
        const files = api?.getFiles?.() || [];
        const durations = files
          .map((f) => f.audioBuffer?.duration || 0)
          .filter((d) => d > 0);
        wavMax = durations.length > 0 ? Math.max(...durations) : 0;
      } catch {}
      const rawMax = Math.max(midiDur, wavMax);
      return speed > 0 ? rawMax / speed : rawMax;
    } catch {
      return 0;
    }
  }

  constructor(
    container: HTMLElement,
    initialFileItemList: Array<{
      path: string;
      displayName?: string;
      type?: "midi" | "audio";
    }> = [],
    options?: CreateWaveRollPlayerOptions
  ) {
    this.container = container;
    this.midiManager = new MultiMidiManager();
    this.initialFileItemList = initialFileItemList;

    // Expose midiManager globally for audio player track mute/volume checks
    (
      globalThis as unknown as { _waveRollMidiManager?: MultiMidiManager }
    )._waveRollMidiManager = this.midiManager;

    // Apply options
    if (options?.soloMode) {
      this.soloMode = true;
      // In solo mode, hide waveform band by default
      this.pianoRollConfigOverrides.showWaveformBand = false;
      // Force light background color for solo mode
      this.pianoRollConfigOverrides.backgroundColor = 0xffffff;
    }
    if (options?.midiExport) {
      this.midiExportOptions = options.midiExport;
    }
    if (options?.pianoRoll) {
      this.pianoRollConfigOverrides = {
        ...this.pianoRollConfigOverrides,
        ...options.pianoRoll,
      };
    }
    this.defaultHighlightMode = options?.defaultHighlightMode;

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
    if (this.defaultHighlightMode) {
      this.stateManager.updateVisualState({
        highlightMode: this.defaultHighlightMode,
      });
    }

    // Initialize file manager
    this.fileManager = new FileManager(this.midiManager, this.stateManager);

    // Merge provided overrides with mandatory defaults to satisfy strict typing
    const pianoRollConfig: PianoRollConfig = {
      ...DEFAULT_PIANO_ROLL_CONFIG,
      ...this.config.pianoRoll,
      ...this.pianoRollConfigOverrides,
    } as PianoRollConfig;

    // Initialize visualization engine with resolved piano-roll configuration
    this.visualizationEngine = new VisualizationEngine({
      defaultPianoRollConfig: pianoRollConfig,
      updateInterval: this.config.ui.updateInterval, // Sync interval
      enableOverlapDetection: false, // We handle overlap coloring manually
    });

    // Keep seek bar and time display tightly synced with the engine's visual updates.
    this.visualizationEngine.onVisualUpdate(
      ({ currentTime, duration, isPlaying }) => {
        // Always get fresh dependencies to ensure updateSeekBar is available
        const deps = this.getUIDependencies();
        // Use max(MIDI, WAV) with tempo/playback-rate awareness
        const effectiveDuration = this.getEffectiveDuration();
        deps.updateSeekBar?.({ currentTime, duration: effectiveDuration });
        this.updateTimeDisplay(currentTime);
        // Avoid duplicate setTime calls here; CorePlaybackEngine already syncs
        // the piano-roll playhead on its own update loop.
        // Hook audio player's visual update callback only once per new instance
        try {
          const anyEngine = this.visualizationEngine as unknown as {
            coreEngine?: any;
          };
          const ap = anyEngine.coreEngine?.audioPlayer;
          if (
            ap &&
            ap !== this.lastHookedAudioPlayer &&
            typeof ap.setOnVisualUpdate === "function"
          ) {
            ap.setOnVisualUpdate(
              ({
                currentTime,
              }: {
                currentTime: number;
                duration: number;
                isPlaying: boolean;
              }) => {
                const deps2 = this.getUIDependencies();
                const effDur2 = this.getEffectiveDuration();
                deps2.updateSeekBar?.({ currentTime, duration: effDur2 });
                this.updateTimeDisplay(currentTime);
              }
            );
            this.lastHookedAudioPlayer = ap;
          }
        } catch {}
      }
    );

    this.pianoRollManager = createPianoRollManager();
    this.pianoRollManager.initialize(this.pianoRollContainer, []);

    // Use the VisualizationEngine's CorePlaybackEngine instead of creating a separate one
    // this.corePlaybackEngine = coreEngine;

    // Handlers are created below; listeners will be attached afterwards

    // Initialize silence detector for auto-pause functionality
    this.silenceDetector = new SilenceDetector({
      autoResumeOnUnmute: false,
      onSilenceDetected: () => {
        // Auto-pause when all sources are silent
        if (this.visualizationEngine.getState().isPlaying) {
          // console.log("Auto-pausing: all sources are silent");
          this.pausedBySilence = true;
          this.visualizationEngine.pause();
          // Update play button UI to reflect paused state
          this.updatePlayButton();
        }
      },
      onSoundDetected: () => {
        // Requirement: user must press the play button to resume (no auto-resume)
        this.pausedBySilence = false;
        // console.log("Sound detected");
      },
    });

    // Ensure silence detector is aware of current MIDI state so that
    // muting WAV alone does not pause overall playback.
    this.silenceDetector.attachMidiManager(this.midiManager);

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

        if (prevMute !== currMute) {
          // Apply mute change without recreating the audio player
          this.visualizationEngine.setFileMute(file.id, currMute);
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

    // React to state changes (visual/highlight, onset marker, etc.)
    this.stateManager.onStateChange(() => {
      if (this.stateManager.getUIState().isBatchLoading) return;
      this.updateVisualization();
      this.updateSidebar();
      this.updateFileToggleSection();
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
        pianoRoll: this.visualizationEngine.getPianoRollInstance(),
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
        permissions: { ...this.permissions },
        soloMode: this.soloMode,
        midiExport: this.midiExportOptions,
        onFileAddRequest: this.fileAddRequestCallback
          ? () => this.triggerFileAddRequest()
          : undefined,
        onAudioFileAddRequest: this.audioFileAddRequestCallback
          ? () => this.triggerAudioFileAddRequest()
          : undefined,
        addFileFromData: (data: ArrayBuffer | string, filename: string) =>
          this.addFileFromData(data, filename),
      };

      // After creation, convert seconds -> % once we know (tempo/WAV-aware) duration.
      const effectiveDuration = this.getEffectiveDuration();
      if (
        effectiveDuration > 0 &&
        (loopPoints.a !== null || loopPoints.b !== null)
      ) {
        this.uiDeps!.loopPoints = {
          a:
            loopPoints.a !== null
              ? (loopPoints.a / effectiveDuration) * 100
              : null,
          b:
            loopPoints.b !== null
              ? (loopPoints.b / effectiveDuration) * 100
              : null,
        };
      }
    } else {
      // Refresh dynamic fields
      this.uiDeps.midiManager = this.midiManager;
      this.uiDeps.audioPlayer = this.visualizationEngine;
      this.uiDeps.pianoRoll = this.visualizationEngine.getPianoRollInstance();
      this.uiDeps.stateManager = this.stateManager;
      this.uiDeps.filePanStateHandlers = filePanStateHandlersRef;
      this.uiDeps.filePanValues = filePanValuesRef;
      this.uiDeps.muteDueNoLR = uiState.muteDueNoLR;
      this.uiDeps.lastVolumeBeforeMute = uiState.lastVolumeBeforeMute;
      this.uiDeps.minorTimeStep = uiState.minorTimeStep;

      // Convert loopPoints (seconds) -> % for seek-bar visualisation (tempo/WAV-aware)
      const effectiveDuration2 = this.getEffectiveDuration();
      if (
        effectiveDuration2 > 0 &&
        (loopPoints.a !== null || loopPoints.b !== null)
      ) {
        this.uiDeps.loopPoints = {
          a:
            loopPoints.a !== null
              ? (loopPoints.a / effectiveDuration2) * 100
              : null,
          b:
            loopPoints.b !== null
              ? (loopPoints.b / effectiveDuration2) * 100
              : null,
        };
      }
      this.uiDeps.seeking = uiState.seeking;
      this.uiDeps.permissions = { ...this.permissions };
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
        (
          deps as UIComponentDependencies & {
            loopPoints?: { a: number | null; b: number | null } | null;
          }
        ).loopPoints = lp;

        // Also persist A/B markers into the StateManager (in seconds) so that
        // markers survive UI refreshes and re-renders even before enabling loop.
        try {
          const effDur = this.getEffectiveDuration();
          if (!lp) {
            this.stateManager.setLoopPoints(null, null);
          } else {
            const aSec =
              lp.a !== null && effDur > 0 ? (lp.a / 100) * effDur : null;
            const bSec =
              lp.b !== null && effDur > 0 ? (lp.b / 100) * effDur : null;
            this.stateManager.setLoopPoints(aSec, bSec);
            // console.log("setLoopPoints", aSec, bSec);
          }
        } catch {}

        // Force a seek-bar refresh immediately for snappy feedback.
        // Use absolute (full-length) policy and reflect tempo/rate changes
        // by computing effective duration.
        const effectiveDuration = this.getEffectiveDuration();

        // If loop A exists, snap seekbar preview to A for an instant visual anchor.
        const startPct = lp?.a;
        const startSec =
          startPct !== null && startPct !== undefined && effectiveDuration > 0
            ? (startPct / 100) * effectiveDuration
            : this.visualizationEngine.getState().currentTime;

        deps.updateSeekBar?.({
          currentTime: startSec,
          duration: effectiveDuration,
        });
      }
    );

    // 4) File-visibility toggle section (below controls)
    // Skip in solo mode
    if (!this.soloMode) {
      this.fileToggleContainer = setupFileToggleSection(
        uiElements.playerContainer,
        depsReady
      );
      uiElements.fileToggleContainer = this.fileToggleContainer;
    }

    // Load initial files if provided
    if (this.initialFileItemList.length > 0) {
      await this.loadSampleFiles(this.initialFileItemList);
      // Update UI after loading files (WAV files will auto-update via event listener)
      this.updateSidebar();
      this.updateFileToggleSection();
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
      name?: string;
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

        // Note: We no longer auto-mute WAV on first load to avoid confusion.

        // Ensure AudioPlayer visual update callback is attached once audio exists
        try {
          const anyEngine = this.visualizationEngine as unknown as {
            coreEngine?: any;
          };
          const audioPlayer = anyEngine.coreEngine?.audioPlayer;
          if (
            audioPlayer &&
            typeof audioPlayer.setOnVisualUpdate === "function"
          ) {
            audioPlayer.setOnVisualUpdate(
              ({
                currentTime,
              }: {
                currentTime: number;
                duration: number;
                isPlaying: boolean;
              }) => {
                const effectiveDuration = this.getEffectiveDuration();
                const deps = this.getUIDependencies();
                deps.updateSeekBar?.({
                  currentTime,
                  duration: effectiveDuration,
                });
                this.updateTimeDisplay(currentTime);
              }
            );
          }
        } catch {}

        // Force seekbar update after audio player initialization
        // Use setTimeout to ensure audio player is fully initialized
        setTimeout(() => {
          const effectiveDuration = this.getEffectiveDuration();
          const currentTime = this.visualizationEngine.getState().currentTime;
          const deps = this.getUIDependencies();
          deps.updateSeekBar?.({ currentTime, duration: effectiveDuration });
        }, 100);

        // Note: Soundfont preload is done on first play() to ensure AudioContext is active
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
    // Note: VisualizationEngine doesn't have handleChannelMute,
    // but this functionality might not be needed with the new architecture
    // this.visualizationEngine.handleChannelMute?.(shouldMute);
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
    // StateManager doesn't have a dispose method
  }

  // --- Public control API (used by Web Component/tests) ---
  public async play(): Promise<void> {
    // console.log('[WaveRollPlayer] play() called, using visualizationEngine');
    await this.visualizationEngine.play();
    this.updatePlayButton();
  }

  public pause(): void {
    // console.log('[WaveRollPlayer] pause() called, using visualizationEngine');
    this.visualizationEngine.pause();
    this.updatePlayButton();
  }

  public get isPlaying(): boolean {
    try {
      return !!this.visualizationEngine.getState().isPlaying;
    } catch {
      return false;
    }
  }

  /**
   * Seek to a specific time position
   */
  public seek(time: number): void {
    this.visualizationEngine.seek(time, true);
  }

  /**
   * Update UI permissions at runtime (e.g., readonly mode)
   */
  public setPermissions(
    permissions: Partial<{ canAddFiles: boolean; canRemoveFiles: boolean }>
  ): void {
    this.permissions = { ...this.permissions, ...permissions };
    // Ensure UI deps reflect latest permissions
    if (this.uiDeps) {
      this.uiDeps.permissions = { ...this.permissions };
    }
    // Refresh UI surfaces that may depend on permissions
    try {
      this.updateSidebar();
      this.updateFileToggleSection();
    } catch {}
  }

  // --- Appearance API (for solo mode / external integrations) ---

  /**
   * Set the active color palette by ID.
   * This will reassign colors to all loaded files.
   */
  public setActivePalette(paletteId: string): void {
    this.midiManager.setActivePalette(paletteId);
  }

  /**
   * Get the list of available color palettes (built-in + custom).
   */
  public getAvailablePalettes(): ColorPalette[] {
    const state = this.midiManager.getState();
    return [...DEFAULT_PALETTES, ...state.customPalettes];
  }

  /**
   * Get the currently active palette ID.
   */
  public getActivePaletteId(): string {
    return this.midiManager.getState().activePaletteId;
  }

  /**
   * Set the note color for the first loaded file (useful in solo mode).
   * @param color - Hex color as number (e.g., 0x4e79a7)
   */
  public setNoteColor(color: number): void {
    const files = this.midiManager.getState().files;
    if (files.length > 0) {
      this.midiManager.updateColor(files[0].id, color);
    }
  }

  /**
   * Get the note color of the first loaded file.
   * @returns Color as hex number, or 0x666666 if no file is loaded.
   */
  public getNoteColor(): number {
    const files = this.midiManager.getState().files;
    return files.length > 0 ? files[0].color : 0x666666;
  }

  /**
   * Set the onset marker style for the first loaded file.
   */
  public setOnsetMarkerStyle(style: OnsetMarkerStyle): void {
    const files = this.midiManager.getState().files;
    if (files.length > 0) {
      this.stateManager.setOnsetMarkerForFile(files[0].id, style);
    }
  }

  /**
   * Get the onset marker style for the first loaded file.
   */
  public getOnsetMarkerStyle(): OnsetMarkerStyle | null {
    const files = this.midiManager.getState().files;
    if (files.length > 0) {
      return this.stateManager.getOnsetMarkerForFile(files[0].id) || null;
    }
    return null;
  }

  /**
   * Get the list of available onset marker shapes.
   */
  public getAvailableOnsetMarkerShapes(): OnsetMarkerShape[] {
    return [...ONSET_MARKER_SHAPES];
  }

  /**
   * Get current appearance settings (for persistence).
   */
  public getAppearanceSettings(): AppearanceSettings {
    const paletteId = this.getActivePaletteId();
    const noteColor = this.getNoteColor();
    const style = this.getOnsetMarkerStyle();

    return {
      paletteId,
      noteColor,
      onsetMarker: style
        ? {
            shape: style.shape,
            variant: style.variant,
          }
        : undefined,
    };
  }

  /**
   * Apply appearance settings (for restoration from persistence).
   */
  public applyAppearanceSettings(settings: AppearanceSettings): void {
    // Apply palette first (this may reassign colors)
    if (settings.paletteId) {
      this.setActivePalette(settings.paletteId);
    }

    // Then apply specific note color if provided
    if (settings.noteColor !== undefined) {
      this.setNoteColor(settings.noteColor);
    }

    // Apply onset marker style if provided
    if (settings.onsetMarker) {
      const style: OnsetMarkerStyle = {
        shape: settings.onsetMarker.shape,
        variant: settings.onsetMarker.variant,
        size: 12,
        strokeWidth: 2,
      };
      this.setOnsetMarkerStyle(style);
    }
  }

  /**
   * Subscribe to appearance changes.
   * Returns an unsubscribe function.
   */
  public onAppearanceChange(
    callback: (settings: AppearanceSettings) => void
  ): () => void {
    // Subscribe to midiManager state changes for palette/color changes
    const unsubMidi = this.midiManager.subscribe(() => {
      callback(this.getAppearanceSettings());
    });

    // Subscribe to stateManager for onset marker changes
    const stateCallback = () => {
      callback(this.getAppearanceSettings());
    };
    this.stateManager.onStateChange(stateCallback);

    return () => {
      unsubMidi();
      this.stateManager.offStateChange(stateCallback);
    };
  }

  // --- File Add API (for VS Code integration) ---

  /**
   * Register a callback to be invoked when the user clicks "Add Files" button.
   * This allows VS Code extension to intercept the file add request and show
   * a native file dialog instead of relying on HTML5 file input.
   * Returns an unsubscribe function.
   */
  public onFileAddRequest(callback: () => void): () => void {
    this.fileAddRequestCallback = callback;
    return () => {
      this.fileAddRequestCallback = null;
    };
  }

  /**
   * Check if there's a file add request callback registered.
   * Used by UI components to decide whether to trigger callback or use default behavior.
   */
  public hasFileAddRequestCallback(): boolean {
    return this.fileAddRequestCallback !== null;
  }

  /**
   * Trigger the file add request callback (called by UI components).
   */
  public triggerFileAddRequest(): void {
    if (this.fileAddRequestCallback) {
      this.fileAddRequestCallback();
    }
  }

  /**
   * Register a callback to be invoked when the user clicks "Add Audio File" button.
   * This allows VS Code extension to intercept the audio file add request and show
   * a native file dialog with audio file filters.
   * Returns an unsubscribe function.
   */
  public onAudioFileAddRequest(callback: () => void): () => void {
    this.audioFileAddRequestCallback = callback;
    return () => {
      this.audioFileAddRequestCallback = null;
    };
  }

  /**
   * Trigger the audio file add request callback (called by UI components).
   */
  public triggerAudioFileAddRequest(): void {
    if (this.audioFileAddRequestCallback) {
      this.audioFileAddRequestCallback();
    }
  }

  /**
   * Add a file from raw data (ArrayBuffer or Base64 string).
   * This is useful for VS Code integration where files are passed via postMessage.
   * @param data - File data as ArrayBuffer or Base64 string
   * @param filename - Original filename (used to determine file type)
   */
  public async addFileFromData(
    data: ArrayBuffer | string,
    filename: string
  ): Promise<void> {
    const MIDI_EXTENSIONS = [".mid", ".midi"];
    const AUDIO_EXTENSIONS = [".wav", ".mp3", ".m4a", ".ogg"];

    const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || "";

    // Convert Base64 to ArrayBuffer if needed
    let arrayBuffer: ArrayBuffer;
    if (typeof data === "string") {
      // Decode Base64 to ArrayBuffer
      const binaryString = atob(data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      arrayBuffer = bytes.buffer;
    } else {
      arrayBuffer = data;
    }

    if (MIDI_EXTENSIONS.includes(ext)) {
      // Process MIDI file
      try {
        // Create a File object from ArrayBuffer for parseMidi
        const blob = new Blob([arrayBuffer], { type: "audio/midi" });
        const file = new File([blob], filename, { type: "audio/midi" });

        const { parseMidi } = await import("@/lib/core/parsers/midi-parser");
        const state = this.stateManager?.getState();
        const pedalElongate = state?.visual.pedalElongate ?? true;
        const pedalThreshold = state?.visual.pedalThreshold ?? 64;
        const parsed = await parseMidi(file, {
          applyPedalElongate: pedalElongate,
          pedalThreshold: pedalThreshold,
        });
        this.midiManager.addMidiFile(filename, parsed, undefined, file);
      } catch (err) {
        console.error("Failed to parse MIDI:", err);
        throw err;
      }
    } else if (AUDIO_EXTENSIONS.includes(ext)) {
      // Process audio file
      try {
        const blob = new Blob([arrayBuffer], { type: `audio/${ext.slice(1)}` });
        const url = URL.createObjectURL(blob);
        const { addAudioFileFromUrl } = await import(
          "@/lib/core/waveform/register"
        );
        await addAudioFileFromUrl(null, url, filename);
      } catch (err) {
        console.error("Failed to load audio file:", err);
        throw err;
      }
    } else {
      throw new Error(`Unsupported file type: ${ext}`);
    }

    // Trigger UI update
    this.updateVisualization();
    this.updateSidebar();
    this.updateFileToggleSection();
  }
}

/**
 * Factory function to create multi MIDI demo
 */
export async function createWaveRollPlayer(
  container: HTMLElement,
  files: Array<{ path: string; name?: string }> = [],
  options?: CreateWaveRollPlayerOptions
): Promise<WaveRollPlayer> {
  const demo = new WaveRollPlayer(container, files, options);
  await demo.initialize();
  return demo;
}
