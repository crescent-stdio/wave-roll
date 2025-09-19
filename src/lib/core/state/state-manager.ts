import { AppState, StateManagerConfig } from "./types";
import type { OnsetMarkerStyle } from "@/types";
import { ONSET_MARKER_SHAPES } from "@/core/constants";
import { DEFAULT_STATE_CONFIG, DEFAULT_APP_STATE } from "./default";
import {
  ListenerManager,
  SetManager,
  RecordManager,
  deepClone,
  batchStateUpdate,
  createStateUpdater,
  normalizeLoopPoints,
  percentageToAbsolute,
  shallowMerge
} from "./utils";

export class StateManager {
  private state: AppState;
  private config: StateManagerConfig;
  private readonly listeners = new ListenerManager<() => void>();
  private readonly fileVisibilityManager: SetManager<string>;
  private readonly panHandlersManager: RecordManager<(pan: number | null) => void>;

  constructor(config: Partial<StateManagerConfig> = {}) {
    this.config = shallowMerge(DEFAULT_STATE_CONFIG, config);
    this.state = this.createInitialState();
    
    // Initialize managers
    this.fileVisibilityManager = new SetManager(
      this.state.fileVisibility.visibleFileIds || new Set(),
      (set) => {
        this.state.fileVisibility.visibleFileIds = set;
        this.state.fileVisibility.totalFiles = set.size;
        this.notify();
      }
    );
    
    this.panHandlersManager = new RecordManager(
      this.state.panVolume.filePanStateHandlers,
      (record) => {
        this.state.panVolume.filePanStateHandlers = record;
      }
    );
  }

  /* ====== state creation  ====== */

  private createInitialState(): AppState {
    return deepClone(DEFAULT_APP_STATE);
  }

  /* ====== state getters  ====== */

  public getUIState(): AppState["ui"] {
    return this.state.ui;
  }
  public getState(): AppState {
    return this.state;
  }
  public getConfig(): StateManagerConfig {
    return shallowMerge(this.config);
  }
  public getFilePanValuesRef(): Record<string, number> {
    return this.state.panVolume.filePanValues;
  }
  public getFilePanStateHandlersRef(): Record<
    string,
    (pan: number | null) => void
  > {
    return this.state.panVolume.filePanStateHandlers;
  }
  
  public getFileMuteStatesRef(): Record<string, boolean> {
    return this.state.panVolume.fileMuteStates;
  }

  /* ====== state setters  ====== */
  /**
   * Update UI state
   */
  public updateUIState(updates: Partial<AppState["ui"]>): void {
    this.state.ui = shallowMerge(this.state.ui, updates);
    this.notify();
  }

  /**
   * Update playback state
   */
  public updatePlaybackState(updates: Partial<AppState["playback"]>): void {
    this.state.playback = shallowMerge(this.state.playback, updates);
    this.notify();
  }

  /**
   * Update file visibility state
   */
  public updateFileVisibilityState(
    updates: Partial<AppState["fileVisibility"]>
  ): void {
    this.state.fileVisibility = shallowMerge(this.state.fileVisibility, updates);
    this.notify();
  }

  /**
   * Update loop points state
   */
  public updateLoopPointsState(updates: Partial<AppState["loopPoints"]>): void {
    this.state.loopPoints = shallowMerge(this.state.loopPoints, updates);
    this.notify();
  }

  /**
   * Update pan/volume state
   */
  public updatePanVolumeState(updates: Partial<AppState["panVolume"]>): void {
    this.state.panVolume = shallowMerge(this.state.panVolume, updates);
    this.notify();
  }

  /**
   * Update visual state
   */
  public updateVisualState(updates: Partial<AppState["visual"]>): void {
    this.state.visual = shallowMerge(this.state.visual, updates);
    this.notify();
  }

  /**
   * Update evaluation state
   */
  public updateEvaluationState(updates: Partial<AppState["evaluation"]>): void {
    this.state.evaluation = shallowMerge(this.state.evaluation, updates);
    this.notify();
  }

  /* ====== Onset Marker Mapping ====== */
  /** Assign or update the onset marker style for a file. */
  public setOnsetMarkerForFile(fileId: string, style: OnsetMarkerStyle): void {
    this.state.visual.fileOnsetMarkers[fileId] = style;
    this.notify();
  }

  /** Get the onset marker style for a file, if any. */
  public getOnsetMarkerForFile(fileId: string): OnsetMarkerStyle | undefined {
    return this.state.visual.fileOnsetMarkers[fileId];
  }

  /** Ensure a unique onset marker is assigned to the file if missing. */
  public ensureOnsetMarkerForFile(fileId: string): OnsetMarkerStyle {
    const existing = this.state.visual.fileOnsetMarkers[fileId];
    if (existing) return existing;
    const used = new Set(
      Object.values(this.state.visual.fileOnsetMarkers).map((s) => `${s.shape}:${s.variant}`)
    );
    let picked: OnsetMarkerStyle | null = null;
    for (const shape of ONSET_MARKER_SHAPES) {
      const key = `${shape}:filled`;
      if (!used.has(key)) { picked = { shape: shape as OnsetMarkerStyle["shape"], variant: "filled", size: 12, strokeWidth: 2 }; break; }
    }
    if (!picked) {
      for (const shape of ONSET_MARKER_SHAPES) {
        const key = `${shape}:outlined`;
        if (!used.has(key)) { picked = { shape: shape as OnsetMarkerStyle["shape"], variant: "outlined", size: 12, strokeWidth: 2 }; break; }
      }
    }
    if (!picked) {
      const shape = ONSET_MARKER_SHAPES[Object.keys(this.state.visual.fileOnsetMarkers).length % ONSET_MARKER_SHAPES.length];
      picked = { shape: shape as OnsetMarkerStyle["shape"], variant: "outlined", size: 12, strokeWidth: 2 };
    }
    this.state.visual.fileOnsetMarkers[fileId] = picked;
    this.notify();
    return picked;
  }

  /* ====== state synchronization utilities  ====== */

  /**
   * Preserve state during updates (batch operations)
   */
  public preserveStateForBatch<T>(operation: () => T): T {
    return batchStateUpdate(this.state, () => this.notify(), operation);
  }

  /**
   * Synchronize file visibility with a set of file IDs
   */
  public syncFileVisibility(fileIds: string[]): void {
    this.fileVisibilityManager.sync(fileIds);
  }

  /**
   * Add file to visibility tracking
   */
  public addFileToVisibility(fileId: string): void {
    this.fileVisibilityManager.add(fileId);
  }

  /**
   * Remove file from visibility tracking
   */
  public removeFileFromVisibility(fileId: string): void {
    this.fileVisibilityManager.remove(fileId);
  }

  /**
   * Toggle file visibility
   */
  public toggleFileVisibility(fileId: string): boolean {
    return this.fileVisibilityManager.toggle(fileId);
  }

  /* ====== Pan / volume  ====== */

  /**
   * Set pan value for a file
   */
  public setFilePanValue(fileId: string, panValue: number): void {
    this.state.panVolume.filePanValues[fileId] = panValue;
    this.notify();
  }
  /**
   * Register pan state handler for a file
   */
  public registerFilePanHandler(
    fileId: string,
    handler: (pan: number | null) => void
  ): void {
    this.panHandlersManager.set(fileId, handler);
  }
  /**
   * Unregister pan state handler for a file
   */
  public unregisterFilePanHandler(fileId: string): void {
    this.panHandlersManager.remove(fileId);
  }
  /**
   * Synchronize pan values across all files
   */
  public syncPanValues(panValue: number | null): void {
    this.panHandlersManager.forEach((handler) => {
      handler(panValue);
    });
  }
  
  /**
   * Set mute state for a file
   */
  public setFileMuteState(fileId: string, muted: boolean): void {
    this.state.panVolume.fileMuteStates[fileId] = muted;
    this.notify();
  }
  
  /**
   * Get mute state for a file
   */
  public getFileMuteState(fileId: string): boolean {
    return this.state.panVolume.fileMuteStates[fileId] || false;
  }

  /* ====== loop points  ====== */
  /**
   * Set loop points with validation
   */
  public setLoopPoints(a: number | null, b: number | null): void {
    const [normalizedA, normalizedB] = normalizeLoopPoints(a, b);
    this.state.loopPoints = { a: normalizedA, b: normalizedB };
    this.notify();
  }
  /**
   * Clear loop points
   */
  public clearLoopPoints(): void {
    this.setLoopPoints(null, null);
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

    this.setLoopPoints(
      percentageToAbsolute(aPercent, duration),
      percentageToAbsolute(bPercent, duration)
    );
  }

  /* ====== config & reset  ====== */

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<StateManagerConfig>): void {
    this.config = shallowMerge(this.config, updates);
  }

  /**
   * Reset state to initial values
   */
  public resetState(): void {
    this.state = this.createInitialState();
    this.notify();
  }

  /* ====== helpers  ====== */

  /**
   * Register state change callback
   */
  public onStateChange(callback: () => void): void {
    this.listeners.add(callback);
  }

  /**
   * Unregister state change callback
   */
  public offStateChange(callback: () => void): void {
    this.listeners.remove(callback);
  }

  /**
   * Notify all registered callbacks of state change
   */
  private notify(): void {
    if (this.state.ui.isBatchLoading) return;
    this.listeners.notify();
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
