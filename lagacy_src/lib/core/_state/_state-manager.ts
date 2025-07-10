/**
 * StateManager - Centralized state management for MultiMidiDemo
 * Handles UI state, playback state, file visibility, loop points, and pan/volume state
 */

// State interface definitions

/**
 * UI state for player controls and interface elements
 */
export interface UIState {
  seeking: boolean;
  isBatchLoading: boolean;
  updateLoopId: number | null;
  muteDueNoLR: boolean;
  lastVolumeBeforeMute: number;
  minorTimeStep: number;
}

/**
 * Playback state for audio player and timing
 */
export interface PlaybackState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
}

/**
 * File visibility state for managing which MIDI files are shown
 */
export interface FileVisibilityState {
  visibleFileIds: Set<string>;
  totalFiles: number;
}

/**
 * Loop points state for A-B loop functionality
 */
export interface LoopPointsState {
  a: number | null;
  b: number | null;
}

/**
 * Pan and volume state for individual files
 */
export interface PanVolumeState {
  filePanValues: Record<string, number>;
  filePanStateHandlers: Record<string, (pan: number | null) => void>;
}

/**
 * Visual state for piano roll and note rendering
 */
export interface VisualState {
  currentNoteColors: number[];
  zoomLevel: number;
}

/**
 * Complete application state
 */
export interface AppState {
  ui: UIState;
  playback: PlaybackState;
  fileVisibility: FileVisibilityState;
  loopPoints: LoopPointsState;
  panVolume: PanVolumeState;
  visual: VisualState;
}

/**
 * Configuration for state manager
 */
export interface StateManagerConfig {
  defaultVolume: number;
  defaultMinorTimeStep: number;
  defaultZoomLevel: number;
  updateInterval: number;
}

// Default configurations

export const DEFAULT_STATE_CONFIG: StateManagerConfig = {
  defaultVolume: 0.7,
  defaultMinorTimeStep: 0.1,
  defaultZoomLevel: 1.0,
  updateInterval: 50, // 50ms update interval
};

export const DEFAULT_UI_STATE: UIState = {
  seeking: false,
  isBatchLoading: false,
  updateLoopId: null,
  muteDueNoLR: false,
  lastVolumeBeforeMute: DEFAULT_STATE_CONFIG.defaultVolume,
  minorTimeStep: DEFAULT_STATE_CONFIG.defaultMinorTimeStep,
};

export const DEFAULT_PLAYBACK_STATE: PlaybackState = {
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  volume: DEFAULT_STATE_CONFIG.defaultVolume,
};

export const DEFAULT_FILE_VISIBILITY_STATE: FileVisibilityState = {
  visibleFileIds: new Set(),
  totalFiles: 0,
};

export const DEFAULT_LOOP_POINTS_STATE: LoopPointsState = {
  a: null,
  b: null,
};

export const DEFAULT_PAN_VOLUME_STATE: PanVolumeState = {
  filePanValues: {},
  filePanStateHandlers: {},
};

export const DEFAULT_VISUAL_STATE: VisualState = {
  currentNoteColors: [],
  zoomLevel: DEFAULT_STATE_CONFIG.defaultZoomLevel,
};

// State management class

/**
 * Centralized state manager for MultiMidiDemo
 */
export class StateManager {
  private state: AppState;
  private config: StateManagerConfig;
  private stateChangeCallbacks: (() => void)[] = [];

  constructor(config: Partial<StateManagerConfig> = {}) {
    this.config = { ...DEFAULT_STATE_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  /**
   * Create initial application state
   */
  private createInitialState(): AppState {
    return {
      ui: { ...DEFAULT_UI_STATE },
      playback: { ...DEFAULT_PLAYBACK_STATE },
      fileVisibility: { ...DEFAULT_FILE_VISIBILITY_STATE },
      loopPoints: { ...DEFAULT_LOOP_POINTS_STATE },
      panVolume: {
        filePanValues: {},
        filePanStateHandlers: {},
      },
      visual: { ...DEFAULT_VISUAL_STATE },
    };
  }

  // State getters

  /**
   * Get current UI state
   */
  public getUIState(): UIState {
    return { ...this.state.ui };
  }

  /**
   * Get current playback state
   */
  public getPlaybackState(): PlaybackState {
    return { ...this.state.playback };
  }

  /**
   * Get current file visibility state
   */
  public getFileVisibilityState(): FileVisibilityState {
    return {
      visibleFileIds: new Set(this.state.fileVisibility.visibleFileIds),
      totalFiles: this.state.fileVisibility.totalFiles,
    };
  }

  /**
   * Get current loop points state
   */
  public getLoopPointsState(): LoopPointsState {
    return { ...this.state.loopPoints };
  }

  /**
   * Get current pan/volume state
   */
  public getPanVolumeState(): PanVolumeState {
    return {
      filePanValues: { ...this.state.panVolume.filePanValues },
      filePanStateHandlers: { ...this.state.panVolume.filePanStateHandlers },
    };
  }

  /**
   * Get current visual state
   */
  public getVisualState(): VisualState {
    return { ...this.state.visual };
  }

  /**
   * Get complete application state
   */
  public getState(): AppState {
    return {
      ui: this.getUIState(),
      playback: this.getPlaybackState(),
      fileVisibility: this.getFileVisibilityState(),
      loopPoints: this.getLoopPointsState(),
      panVolume: this.getPanVolumeState(),
      visual: this.getVisualState(),
    };
  }

  // NEW METHODS: provide direct references for mutable access
  /**
   * Get mutable reference to file pan values map (fileId -> pan value).
   * Mutating this map will NOT trigger state change notifications automatically.
   * Call setFilePanValue when a reactive update is required.
   */
  public getFilePanValuesRef(): Record<string, number> {
    return this.state.panVolume.filePanValues;
  }

  /**
   * Get mutable reference to file pan state handlers map.
   */
  public getFilePanStateHandlersRef(): Record<
    string,
    (pan: number | null) => void
  > {
    return this.state.panVolume.filePanStateHandlers;
  }

  // State setters

  /**
   * Update UI state
   */
  public updateUIState(updates: Partial<UIState>): void {
    this.state.ui = { ...this.state.ui, ...updates };
    this.notifyStateChange();
  }

  /**
   * Update playback state
   */
  public updatePlaybackState(updates: Partial<PlaybackState>): void {
    this.state.playback = { ...this.state.playback, ...updates };
    this.notifyStateChange();
  }

  /**
   * Update file visibility state
   */
  public updateFileVisibilityState(
    updates: Partial<FileVisibilityState>
  ): void {
    this.state.fileVisibility = { ...this.state.fileVisibility, ...updates };
    this.notifyStateChange();
  }

  /**
   * Update loop points state
   */
  public updateLoopPointsState(updates: Partial<LoopPointsState>): void {
    this.state.loopPoints = { ...this.state.loopPoints, ...updates };
    this.notifyStateChange();
  }

  /**
   * Update pan/volume state
   */
  public updatePanVolumeState(updates: Partial<PanVolumeState>): void {
    this.state.panVolume = { ...this.state.panVolume, ...updates };
    this.notifyStateChange();
  }

  /**
   * Update visual state
   */
  public updateVisualState(updates: Partial<VisualState>): void {
    this.state.visual = { ...this.state.visual, ...updates };
    this.notifyStateChange();
  }

  // State synchronization utilities

  /**
   * Preserve state during updates (batch operations)
   */
  public preserveStateForBatch<T>(operation: () => T): T {
    const wasBatchLoading = this.state.ui.isBatchLoading;
    this.state.ui.isBatchLoading = true;

    try {
      return operation();
    } finally {
      this.state.ui.isBatchLoading = wasBatchLoading;
      if (!wasBatchLoading) {
        this.notifyStateChange();
      }
    }
  }

  /**
   * Synchronize file visibility with a set of file IDs
   */
  public syncFileVisibility(fileIds: string[]): void {
    this.state.fileVisibility.visibleFileIds = new Set(fileIds);
    this.state.fileVisibility.totalFiles = fileIds.length;
    this.notifyStateChange();
  }

  /**
   * Add file to visibility tracking
   */
  public addFileToVisibility(fileId: string): void {
    this.state.fileVisibility.visibleFileIds.add(fileId);
    this.state.fileVisibility.totalFiles =
      this.state.fileVisibility.visibleFileIds.size;
    this.notifyStateChange();
  }

  /**
   * Remove file from visibility tracking
   */
  public removeFileFromVisibility(fileId: string): void {
    this.state.fileVisibility.visibleFileIds.delete(fileId);
    this.state.fileVisibility.totalFiles =
      this.state.fileVisibility.visibleFileIds.size;
    this.notifyStateChange();
  }

  /**
   * Toggle file visibility
   */
  public toggleFileVisibility(fileId: string): boolean {
    const isVisible = this.state.fileVisibility.visibleFileIds.has(fileId);
    if (isVisible) {
      this.removeFileFromVisibility(fileId);
    } else {
      this.addFileToVisibility(fileId);
    }
    return !isVisible;
  }

  // Configuration management

  /**
   * Set pan value for a file
   */
  public setFilePanValue(fileId: string, panValue: number): void {
    this.state.panVolume.filePanValues[fileId] = panValue;
    this.notifyStateChange();
  }

  /**
   * Get pan value for a file
   */
  public getFilePanValue(fileId: string): number {
    return this.state.panVolume.filePanValues[fileId] || 0;
  }

  /**
   * Register pan state handler for a file
   */
  public registerFilePanHandler(
    fileId: string,
    handler: (pan: number | null) => void
  ): void {
    this.state.panVolume.filePanStateHandlers[fileId] = handler;
  }

  /**
   * Unregister pan state handler for a file
   */
  public unregisterFilePanHandler(fileId: string): void {
    delete this.state.panVolume.filePanStateHandlers[fileId];
  }

  /**
   * Synchronize pan values across all files
   */
  public syncPanValues(panValue: number | null): void {
    Object.values(this.state.panVolume.filePanStateHandlers).forEach(
      (handler) => {
        handler(panValue);
      }
    );
  }

  /**
   * Set loop points with validation
   */
  public setLoopPoints(a: number | null, b: number | null): void {
    // Validate that A comes before B if both are set
    if (a !== null && b !== null && a > b) {
      console.warn("Loop point A cannot be greater than B, swapping values");
      [a, b] = [b, a];
    }

    this.state.loopPoints = { a, b };
    this.notifyStateChange();
  }

  /**
   * Clear loop points
   */
  public clearLoopPoints(): void {
    this.state.loopPoints = { a: null, b: null };
    this.notifyStateChange();
  }

  /**
   * Convert loop points to percentages based on duration
   */
  public getLoopPointsAsPercentages(): { a: number | null; b: number | null } {
    const { duration } = this.state.playback;
    if (duration === 0) return { a: null, b: null };

    const { a, b } = this.state.loopPoints;
    return {
      a: a !== null ? (a / duration) * 100 : null,
      b: b !== null ? (b / duration) * 100 : null,
    };
  }

  /**
   * Set loop points from percentages
   */
  public setLoopPointsFromPercentages(
    aPercent: number | null,
    bPercent: number | null
  ): void {
    const { duration } = this.state.playback;
    if (duration === 0) return;

    const a = aPercent !== null ? (aPercent / 100) * duration : null;
    const b = bPercent !== null ? (bPercent / 100) * duration : null;

    this.setLoopPoints(a, b);
  }

  // State change notifications

  /**
   * Register state change callback
   */
  public onStateChange(callback: () => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  /**
   * Unregister state change callback
   */
  public offStateChange(callback: () => void): void {
    const index = this.stateChangeCallbacks.indexOf(callback);
    if (index !== -1) {
      this.stateChangeCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify all registered callbacks of state change
   */
  private notifyStateChange(): void {
    // Don't notify during batch operations
    if (this.state.ui.isBatchLoading) {
      return;
    }

    this.stateChangeCallbacks.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error("Error in state change callback:", error);
      }
    });
  }

  // Utility methods

  /**
   * Reset state to initial values
   */
  public resetState(): void {
    this.state = this.createInitialState();
    this.notifyStateChange();
  }

  /**
   * Get current configuration
   */
  public getConfig(): StateManagerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<StateManagerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Check if currently in batch loading mode
   */
  public isBatchLoading(): boolean {
    return this.state.ui.isBatchLoading;
  }

  /**
   * Check if seeking is active
   */
  public isSeeking(): boolean {
    return this.state.ui.seeking;
  }

  /**
   * Check if any files are visible
   */
  public hasVisibleFiles(): boolean {
    return this.state.fileVisibility.visibleFileIds.size > 0;
  }

  /**
   * Check if loop points are set
   */
  public hasLoopPoints(): boolean {
    return this.state.loopPoints.a !== null || this.state.loopPoints.b !== null;
  }
}

// Export convenience functions

/**
 * Create a new state manager instance
 */
export function createStateManager(
  config?: Partial<StateManagerConfig>
): StateManager {
  return new StateManager(config);
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Validate file ID
 */
export function isValidFileId(fileId: string): boolean {
  return typeof fileId === "string" && fileId.length > 0;
}
