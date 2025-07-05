/**
 * MultiMidiDemo - Orchestrator for multiple MIDI files with visualization
 * Refactored to use extracted modules and act as a coordination layer
 */

import { PlayerDemo, PlayerDemoOptions } from "./PlayerDemo";
import { MultiMidiManager, MidiFileEntry } from "./MultiMidiManager";
import { NoteData, ParsedMidi } from "./types";
import { createPianoRoll } from "./components/piano-roll";
import { createAudioPlayer, AudioPlayerControls } from "./AudioPlayer";

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
} from "./multi-midi-demo/ColorUtils";
import {
  StateManager,
  UIState,
  PlaybackState,
  FileVisibilityState,
  LoopPointsState,
  PanVolumeState,
} from "./multi-midi-demo/StateManager";
import {
  FileManager,
  SampleFileConfig,
  DEFAULT_SAMPLE_FILES,
} from "./multi-midi-demo/FileManager";
import {
  VisualizationEngine,
  PianoRollConfig,
  ColoredNote,
} from "./multi-midi-demo/VisualizationEngine";
import {
  AudioController,
  AudioControllerConfig,
} from "./multi-midi-demo/AudioController";
import {
  UILayoutManager,
  UIControlFactory,
  FileItemFactory,
  FileToggleManager,
  SettingsModalManager,
  UIUtils,
  UIComponentDependencies,
  UIElements,
} from "./multi-midi-demo/UIComponents";

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
  }

  /**
   * Get UI dependencies object for UIComponents
   */
  private getUIDependencies(): UIComponentDependencies {
    const uiState = this.stateManager.getUIState();
    const playbackState = this.stateManager.getPlaybackState();
    const loopPoints = this.stateManager.getLoopPointsState();
    const panVolumeState = this.stateManager.getPanVolumeState();

    // Reuse existing object so that mutations done by UIComponents persist
    if (!this.uiDeps) {
      this.uiDeps = {
        midiManager: this.midiManager,
        audioPlayer: this.visualizationEngine,
        pianoRollInstance: this.visualizationEngine.getPianoRollInstance(),
        filePanStateHandlers: panVolumeState.filePanStateHandlers,
        filePanValues: panVolumeState.filePanValues,
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
      this.uiDeps.filePanStateHandlers = panVolumeState.filePanStateHandlers;
      this.uiDeps.filePanValues = panVolumeState.filePanValues;
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
    const state = this.midiManager.getState();
    const playbackState = this.stateManager.getPlaybackState();

    // Get colored notes using color utils functions
    const coloredNotes = this.getColoredNotes(state);

    // Update visualization engine
    this.visualizationEngine.updateVisualization(coloredNotes);
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
        });
      });
    });

    // Detect overlapping notes and apply overlap color
    const overlappingIndices = detectOverlappingNotes(notes);

    return notes.map((coloredNote, index) => {
      if (overlappingIndices.has(index)) {
        return {
          ...coloredNote,
          color:
            typeof COLOR_OVERLAP === "string"
              ? parseInt(COLOR_OVERLAP.replace("#", ""), 16)
              : COLOR_OVERLAP,
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
      this.updateSeekBar();
      this.updateTimeDisplay();
    };

    const loopId = setInterval(updateLoop, updateInterval) as unknown as number;
    this.stateManager.updateUIState({ updateLoopId: loopId });
  }

  /**
   * Update seek bar
   */
  private updateSeekBar(): void {
    if (
      this.uiDeps?.updateSeekBar &&
      typeof this.uiDeps.updateSeekBar === "function"
    ) {
      this.uiDeps.updateSeekBar();
    }
  }

  /**
   * Update play button
   */
  private updatePlayButton(): void {
    // Update play button implementation handled by UI components
    // This method is kept for compatibility with UI dependencies
  }

  /**
   * Update time display
   */
  private updateTimeDisplay(): void {
    const playbackState = this.stateManager.getPlaybackState();
    this.timeDisplay.textContent = UIUtils.formatTime(
      playbackState.currentTime
    );
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
   * Cleanup resources
   */
  public dispose(): void {
    // Stop update loop
    const uiState = this.stateManager.getUIState();
    if (uiState.updateLoopId) {
      clearInterval(uiState.updateLoopId);
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
