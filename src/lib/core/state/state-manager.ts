import { AppState, StateManagerConfig } from "./types";
import { DEFAULT_STATE_CONFIG } from "./default";
import { DEFAULT_APP_STATE } from "./default";

export class StateManager {
  private state: AppState;
  private config: StateManagerConfig;
  private readonly listeners: (() => void)[] = [];

  constructor(config: Partial<StateManagerConfig> = {}) {
    this.config = { ...DEFAULT_STATE_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  /* ====== state creation  ====== */

  private createInitialState(): AppState {
    return JSON.parse(JSON.stringify(DEFAULT_APP_STATE)) as AppState;
  }

  /* ====== state getters  ====== */

  public getUIState(): AppState["ui"] {
    return this.state.ui;
  }
  public getState(): AppState {
    return this.state;
  }
  public getConfig(): StateManagerConfig {
    return { ...this.config };
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
    this.state.ui = { ...this.state.ui, ...updates };
    this.notify();
  }

  /**
   * Update playback state
   */
  public updatePlaybackState(updates: Partial<AppState["playback"]>): void {
    this.state.playback = { ...this.state.playback, ...updates };
    this.notify();
  }

  /**
   * Update file visibility state
   */
  public updateFileVisibilityState(
    updates: Partial<AppState["fileVisibility"]>
  ): void {
    this.state.fileVisibility = { ...this.state.fileVisibility, ...updates };
    this.notify();
  }

  /**
   * Update loop points state
   */
  public updateLoopPointsState(updates: Partial<AppState["loopPoints"]>): void {
    this.state.loopPoints = { ...this.state.loopPoints, ...updates };
    this.notify();
  }

  /**
   * Update pan/volume state
   */
  public updatePanVolumeState(updates: Partial<AppState["panVolume"]>): void {
    this.state.panVolume = { ...this.state.panVolume, ...updates };
    this.notify();
  }

  /**
   * Update visual state
   */
  public updateVisualState(updates: Partial<AppState["visual"]>): void {
    this.state.visual = { ...this.state.visual, ...updates };
    this.notify();
  }

  /**
   * Update evaluation state
   */
  public updateEvaluationState(updates: Partial<AppState["evaluation"]>): void {
    this.state.evaluation = { ...this.state.evaluation, ...updates };
    this.notify();
  }

  /* ====== state synchronization utilities  ====== */

  /**
   * Preserve state during updates (batch operations)
   */
  public preserveStateForBatch<T>(operation: () => T): T {
    const prevBatchLoading = this.state.ui.isBatchLoading;
    this.state.ui.isBatchLoading = true;

    try {
      return operation();
    } finally {
      this.state.ui.isBatchLoading = prevBatchLoading;
      if (!prevBatchLoading) this.notify();
    }
  }

  /**
   * Synchronize file visibility with a set of file IDs
   */
  public syncFileVisibility(fileIds: string[]): void {
    this.state.fileVisibility.visibleFileIds = new Set(fileIds);
    this.state.fileVisibility.totalFiles = fileIds.length;
    this.notify();
  }

  /**
   * Add file to visibility tracking
   */
  public addFileToVisibility(fileId: string): void {
    this.state.fileVisibility.visibleFileIds.add(fileId);
    this.state.fileVisibility.totalFiles =
      this.state.fileVisibility.visibleFileIds.size;
    this.notify();
  }

  /**
   * Remove file from visibility tracking
   */
  public removeFileFromVisibility(fileId: string): void {
    this.state.fileVisibility.visibleFileIds.delete(fileId);
    this.state.fileVisibility.totalFiles =
      this.state.fileVisibility.visibleFileIds.size;
    this.notify();
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
    if (a !== null && b !== null && a > b) [a, b] = [b, a];
    this.state.loopPoints = { a, b };
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
      aPercent !== null ? (aPercent / 100) * duration : null,
      bPercent !== null ? (bPercent / 100) * duration : null
    );
  }

  /* ====== config & reset  ====== */

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<StateManagerConfig>): void {
    this.config = { ...this.config, ...updates };
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
    this.listeners.push(callback);
  }

  /**
   * Unregister state change callback
   */
  public offStateChange(callback: () => void): void {
    const index = this.listeners.indexOf(callback);
    if (index !== -1) this.listeners.splice(index, 1);
  }

  /**
   * Notify all registered callbacks of state change
   */
  private notify(): void {
    if (this.state.ui.isBatchLoading) return;

    this.listeners.forEach((callback) => {
      try {
        callback();
      } catch (error) {
        console.error("Error in state change callback:", error);
      }
    });
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
