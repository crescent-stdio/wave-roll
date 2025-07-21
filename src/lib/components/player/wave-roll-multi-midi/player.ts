/**
 * MultiMidiDemo - Orchestrator for multiple MIDI files with visualization
 * Refactored to use extracted modules and act as a coordination layer
 */

import { NoteData, ControlChangeEvent } from "@/lib/midi/types";
import { MultiMidiManager } from "@/lib/core/midi/multi-midi-manager";

import {
  COLOR_PRIMARY,
  COLOR_A,
  COLOR_B,
  COLOR_OVERLAP,
} from "@/lib/core/constants";
import { detectOverlappingNotes } from "@/lib/core/utils/midi/overlap";

import { MidiFileItemList } from "@/lib/core/file/types";
import { WaveRollMultiMidiPlayerOptions } from "./types";
import { createDefaultConfig, setupLayout } from "./layout";
import {
  ColoredNote,
  VisualizationEngine,
  DEFAULT_PIANO_ROLL_CONFIG,
} from "@/core/visualization";
import { StateManager } from "@/core/state";
import { FileManager } from "@/core/file";
import { UIComponentDependencies, UIElements } from "@/lib/components/ui";
import { formatTime } from "@/core/utils";
import { UILayoutManager } from "@/lib/components/ui/layout-manager";
import { DEFAULT_SAMPLE_FILES } from "@/core/file/constants";
import { FileToggleManager } from "@/lib/components/ui/file/toggle-manager";
import { setupUI } from "@/lib/components/ui/controls";
import { setupFileToggleSection } from "./layout";
import { AudioPlayerContainer } from "@/core/audio";
import {
  CorePlaybackEngine,
  createCorePlaybackEngine,
  createPianoRollManager,
  PianoRollConfig,
  PianoRollManager,
} from "@/core/playback";
import { openSettingsModal } from "@/lib/components/ui/settings/modal";
import {
  computeNoteMetrics,
  DEFAULT_TOLERANCES,
} from "@/lib/evaluation/transcription";

/**
 * Demo for multiple MIDI files - Acts as orchestrator for extracted modules
 */
export class WaveRollMultiMidiPlayer {
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
  private config: WaveRollMultiMidiPlayerOptions;

  // Store initial files for initialization
  private initialFileItemList: MidiFileItemList = [];

  // Cached UI dependencies object so that UIComponents can write on it and we can read back
  private uiDeps: UIComponentDependencies | null = null;

  // Prevent rapid toggle issues
  private isTogglingPlayback = false;

  constructor(
    container: HTMLElement,
    initialFileItemList: MidiFileItemList = []
  ) {
    this.container = container;
    this.midiManager = new MultiMidiManager();
    this.initialFileItemList = initialFileItemList;

    // Initialize configuration
    this.config = createDefaultConfig();

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
    this.fileManager = new FileManager(this.midiManager);

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
        formatTime: (seconds: number) => formatTime(seconds),
      };

      // After creation, convert seconds → % once we know duration.
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
      this.uiDeps.filePanStateHandlers = filePanStateHandlersRef;
      this.uiDeps.filePanValues = filePanValuesRef;
      this.uiDeps.muteDueNoLR = uiState.muteDueNoLR;
      this.uiDeps.lastVolumeBeforeMute = uiState.lastVolumeBeforeMute;
      this.uiDeps.minorTimeStep = uiState.minorTimeStep;

      // Convert loopPoints (seconds) → % for seek-bar visualisation
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

    // Load initial files
    if (this.initialFileItemList.length > 0) {
      await this.loadSampleFiles(this.initialFileItemList);
    } else {
      await this.loadSampleFiles();
    }
    console.log("this.midiManager.getState()", this.midiManager.getState());

    const custom = { ...DEFAULT_TOLERANCES, onsetTolerance: 0.03 };
    const ref = this.midiManager.getState().files[0].parsedData;
    const est = this.midiManager.getState().files[1].parsedData;

    /*
     * Only compute metrics when both reference and estimated MIDI objects are
     * available. The `computeNoteMetrics` utility expects full `ParsedMidi`
     * objects, not just the `notes` arrays.
     */
    if (ref && est) {
      console.log("computeNoteMetrics", computeNoteMetrics(ref, est, custom));
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
    // We only need the piano-roll to be ready here; the AudioPlayer will be
    // lazily created by `VisualizationEngine.updateVisualization()` as soon
    // as it receives the first batch of notes. Checking the full
    // `VisualizationEngine.isInitialized()` would erroneously wait for the
    // audio player, creating a circular dependency (it can’t exist until we
    // call this method). Hence, we guard only against an un-initialised
    // piano-roll instance.
    if (!this.visualizationEngine?.getPianoRollInstance()) {
      return;
    }

    const state = this.midiManager.getState();

    // Build notes for piano-roll (visible) and audio (all but muted)
    const coloredNotesVisible = this.getColoredNotes(state);

    // --- Audio mixing --------------------------------------------------
    const activeFileCount = state.files.filter(
      (file: any) => file.parsedData && !file.isMuted
    ).length;
    const velocityScale = 1 / Math.max(1, activeFileCount);

    const audioNotes: NoteData[] = [];
    state.files.forEach((file: any) => {
      if (file.parsedData && !file.isMuted) {
        // Clone each note and scale velocity to compensate for the number of
        // concurrently sounding tracks.  This prevents the overall mix from
        // becoming excessively loud when several MIDI files play together.
        file.parsedData.notes.forEach((note: NoteData) => {
          // Keep velocity within valid [0,1] range.
          const scaledVel = Math.min(1, note.velocity * velocityScale);
          audioNotes.push({ ...note, velocity: scaledVel, fileId: file.id });
        });
      }
    });

    // --------------------------------------------------------------
    // Sustain-pedal CC events (64) for visible tracks
    // --------------------------------------------------------------
    const controlChanges: ControlChangeEvent[] = [];
    state.files.forEach((file: any) => {
      const sustainVisible = file.isSustainVisible ?? true;
      if (
        !file.isPianoRollVisible ||
        !sustainVisible ||
        !file.parsedData?.controlChanges
      )
        return;
      // Stamp each CC event with the originating fileId so the renderer can
      // apply consistent per-track colouring.
      file.parsedData.controlChanges.forEach((cc: ControlChangeEvent) => {
        controlChanges.push({ ...cc, fileId: file.id });
      });
    });
    // Chronological order helps renderer build segments quicker
    controlChanges.sort(
      (a: ControlChangeEvent, b: ControlChangeEvent) => a.time - b.time
    );

    // Update visualization engine
    this.visualizationEngine.updateVisualization(
      coloredNotesVisible,
      audioNotes
    );

    // Push CC data to piano-roll so sustain overlay can render
    const piano = this.visualizationEngine.getPianoRollInstance();
    if (piano) {
      piano.setControlChanges?.(controlChanges);
    }
  }

  /**
   * Get colored notes from MIDI state
   */
  private getColoredNotes(state: any): ColoredNote[] {
    const fallbackColors = [COLOR_PRIMARY, COLOR_A, COLOR_B];

    const toNumberColor = (c: string | number): number =>
      typeof c === "number" ? c : parseInt(c.replace("#", ""), 16);

    /* ------------------------------------------------------------------
     * 1) Collect visible notes with their per-file base color
     * ------------------------------------------------------------------ */
    const baseNotes: ColoredNote[] = [];

    state.files.forEach((file: any, index: number) => {
      if (!file.isPianoRollVisible || !file.parsedData?.notes) return;

      const rawColor =
        file.color ?? fallbackColors[index % fallbackColors.length];
      const colorHex = toNumberColor(rawColor);

      file.parsedData.notes.forEach((note: any) => {
        // Ensure the NoteData carries its originating fileId for later lookup
        const taggedNote = { ...note, fileId: file.id } as NoteData;

        baseNotes.push({
          note: taggedNote,
          color: colorHex,
          fileId: file.id,
          isMuted: file.isMuted ?? false,
        });
      });
    });

    /* ------------------------------------------------------------------
     * 2) Analyse overlaps (pitch & time) between *different* files
     * ------------------------------------------------------------------ */
    const overlappingMap = detectOverlappingNotes(baseNotes);
    const overlapColorHex = toNumberColor(COLOR_OVERLAP);

    /* ------------------------------------------------------------------
     * 3) Split notes so that only the true intersection is tinted with the
     *    overlap color. Each original note can therefore generate:
     *      • 0..N non-overlapping segments (base color)
     *      • N   overlapping  segments (overlap color)
     * ------------------------------------------------------------------ */
    const finalNotes: ColoredNote[] = [];

    baseNotes.forEach((original, idx) => {
      const ranges = overlappingMap.get(idx) ?? [];

      if (ranges.length === 0) {
        // No overlaps → keep the original note as-is
        finalNotes.push(original);
        return;
      }

      // Ensure ranges are sorted & merged (detectOverlappingNotes already
      // merges adjoining ranges but we sort just in case).
      const sorted = [...ranges].sort((a, b) => a.start - b.start);

      let cursor = original.note.time;
      const endTime = original.note.time + original.note.duration;

      const pushSegment = (start: number, duration: number, color: number) => {
        if (duration <= 0) return;
        finalNotes.push({
          note: {
            ...original.note,
            time: start,
            duration,
          },
          color,
          fileId: original.fileId,
          isMuted: original.isMuted,
        });
      };

      sorted.forEach(({ start, end }) => {
        // 3a) non-overlap segment before this range
        pushSegment(cursor, start - cursor, original.color);

        // 3b) the actual overlap segment
        pushSegment(start, end - start, overlapColorHex);

        cursor = Math.max(cursor, end);
      });

      // 3c) tail of the note after the last overlap
      pushSegment(cursor, endTime - cursor, original.color);
    });

    // Sort by start-time to keep deterministic sprite order
    finalNotes.sort((a, b) => a.note.time - b.note.time);

    return finalNotes;
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

    // Track if we've seen non-zero time since playback started
    let hasSeenNonZeroTime = false;

    const updateLoop = () => {
      // Keep UI dependency in sync with current visualization engine so
      // updateSeekBar always queries the live audioPlayer instance.
      if (this.uiDeps) {
        this.uiDeps.audioPlayer = this.visualizationEngine;
      }

      // Get current state from visualization engine
      const state = this.visualizationEngine.getState();
      if (state) {
        // Track when we see non-zero time
        if (state.currentTime > 0) {
          hasSeenNonZeroTime = true;
        }

        // Skip redundant 0-second frames that occur immediately after
        // playback starts. These frames arrive before the audio transport
        // advances and would reset the seek-bar back to 0 even though
        // onVisualUpdate has already shown progress.
        // Only skip if we haven't seen any non-zero time yet
        if (state.isPlaying && state.currentTime === 0 && !hasSeenNonZeroTime) {
          return;
        }

        // Reset tracking when playback stops
        if (!state.isPlaying) {
          hasSeenNonZeroTime = false;
        }

        this.updatePianoRoll();

        // Update piano roll time position (handled by onVisualUpdate now)
        // const pianoRollInstance =
        //   this.visualizationEngine.getPianoRollInstance();
        // if (pianoRollInstance) {
        //   pianoRollInstance.setTime(state.currentTime);
        // }

        // Update seek bar with current state
        if (this.uiDeps?.updateSeekBar) {
          this.uiDeps.updateSeekBar({
            currentTime: state.currentTime,
            duration: state.duration,
          } as any);
        }

        // Update time display
        this.updateTimeDisplay(state.currentTime);
      } else {
        // Fallback if state is not available
        this.updateSeekBar();
        this.updateTimeDisplay();
      }

      // Keep play/pause button icon in sync with actual playback state
      if (
        this.uiDeps?.updatePlayButton &&
        typeof this.uiDeps.updatePlayButton === "function"
      ) {
        this.uiDeps.updatePlayButton();
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
  }

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
      // Always pass explicit state to ensure seekbar is updated
      this.uiDeps.updateSeekBar({
        currentTime: state.currentTime,
        duration: state.duration,
      } as any);

      // Also ensure piano roll is synced
      const pianoRollInstance = this.visualizationEngine.getPianoRollInstance();
      if (pianoRollInstance) {
        pianoRollInstance.setTime(state.currentTime);
      }
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
        : this.stateManager.getState().playback.currentTime;

    this.timeDisplay.textContent = formatTime(seconds);
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
  private openSettingsModal(): void {
    openSettingsModal(this.getUIDependencies());
  }

  /**
   * Setup keyboard listener
   */
  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return; // Ignore auto-repeat

    // We only handle the Space key here
    if (!(event.code === "Space" || event.key === " ")) return;

    // Skip if focus is on an interactive element that already consumes Space
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

    // Debounce rapid toggling
    if (this.isTogglingPlayback) return;
    this.isTogglingPlayback = true;

    // Always work off the freshest UI dependencies
    const deps = this.getUIDependencies();
    const audioPlayer = deps.audioPlayer;

    // Safety check - if no audioPlayer is available, bail out gracefully
    if (!audioPlayer) {
      this.isTogglingPlayback = false;
      return;
    }

    const state = audioPlayer.getState();

    if (state?.isPlaying) {
      // Currently playing → pause
      deps.audioPlayer?.pause();
      // Clear debounce shortly after pausing so we can resume quickly
      setTimeout(() => {
        this.isTogglingPlayback = false;
      }, 100);
    } else {
      // Currently paused → play via space-bar

      audioPlayer
        .play()
        .then(() => {
          // Playback has effectively started - refresh UI once.
          this.startUpdateLoop();
          deps.updatePlayButton?.();
          deps.updateSeekBar?.();
        })
        .catch((error: any) => {
          console.error("Failed to play:", error);
        })
        .finally(() => {
          // Always release the debounce lock, even if play() fails
          setTimeout(() => {
            this.isTogglingPlayback = false;
          }, 100);
        });
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
    // this.audioController.destroy();
    this.corePlaybackEngine?.destroy();
    // StateManager doesn't have a dispose method
  }
}

/**
 * Factory function to create multi MIDI demo
 */
export async function createWaveRollMultiMidiPlayer(
  container: HTMLElement,
  files: Array<{ path: string; displayName?: string }> = []
): Promise<WaveRollMultiMidiPlayer> {
  const demo = new WaveRollMultiMidiPlayer(container, files);
  await demo.initialize();
  return demo;
}
