import { AppState, StateManagerConfig } from "./types";
import type { OnsetMarkerStyle } from "@/types";
import { ONSET_MARKER_SHAPES } from "@/core/constants";
import { DEFAULT_STATE_CONFIG, DEFAULT_APP_STATE } from "./default";
import { 
  createStateUpdater, 
  batchStateUpdate, 
  deepClone,
  createStateGetter 
} from "./utils/state-updater";
import { SetManager } from "./utils/set-operations";
import { ListenerManager } from "./utils/listener-manager";
import { 
  normalizeLoopPoints, 
  percentagesToLoopPoints 
} from "./utils/value-converters";

export class StateManager {
  private state: AppState;
  private config: StateManagerConfig;
  private readonly listeners = new ListenerManager<() => void>();
  private fileVisibilityManager: SetManager<string>;

  // Pre-bound update functions for each state slice
  private readonly updateUI: (updates: Partial<AppState["ui"]>) => void;
  private readonly updatePlayback: (updates: Partial<AppState["playback"]>) => void;
  private readonly updateFileVisibility: (updates: Partial<AppState["fileVisibility"]>) => void;
  private readonly updateLoopPoints: (updates: Partial<AppState["loopPoints"]>) => void;
  private readonly updatePanVolume: (updates: Partial<AppState["panVolume"]>) => void;
  private readonly updateVisual: (updates: Partial<AppState["visual"]>) => void;
  private readonly updateEvaluation: (updates: Partial<AppState["evaluation"]>) => void;

  constructor(config: Partial<StateManagerConfig> = {}) {
    this.config = { ...DEFAULT_STATE_CONFIG, ...config };
    this.state = this.createInitialState();
    
    // Initialize update functions
    const notify = () => this.notify();
    this.updateUI = createStateUpdater("ui", this.state, notify);
    this.updatePlayback = createStateUpdater("playback", this.state, notify);
    this.updateFileVisibility = createStateUpdater("fileVisibility", this.state, notify);
    this.updateLoopPoints = createStateUpdater("loopPoints", this.state, notify);
    this.updatePanVolume = createStateUpdater("panVolume", this.state, notify);
    this.updateVisual = createStateUpdater("visual", this.state, notify);
    this.updateEvaluation = createStateUpdater("evaluation", this.state, notify);

    // Initialize file visibility manager
    this.fileVisibilityManager = new SetManager(
      this.state.fileVisibility.visibleFileIds,
      (set) => {
        this.state.fileVisibility.visibleFileIds = set;
        this.state.fileVisibility.totalFiles = set.size;
        this.notify();
      }
    );
  }

  /* ====== State Creation ====== */
  private createInitialState(): AppState {
    return deepClone(DEFAULT_APP_STATE);
  }

  /* ====== State Getters ====== */
  public getState = (): AppState => this.state;
  public getUIState = (): AppState["ui"] => this.state.ui;
  public getConfig = (): StateManagerConfig => ({ ...this.config });
  
  // Reference getters for mutable objects
  public getFilePanValuesRef = (): Record<string, number> => 
    this.state.panVolume.filePanValues;
  
  public getFilePanStateHandlersRef = (): Record<string, (pan: number | null) => void> => 
    this.state.panVolume.filePanStateHandlers;
  
  public getFileMuteStatesRef = (): Record<string, boolean> => 
    this.state.panVolume.fileMuteStates;

  /* ====== State Setters (now using pre-bound updaters) ====== */
  public updateUIState = (updates: Partial<AppState["ui"]>): void => 
    this.updateUI(updates);
  
  public updatePlaybackState = (updates: Partial<AppState["playback"]>): void => 
    this.updatePlayback(updates);
  
  public updateFileVisibilityState = (updates: Partial<AppState["fileVisibility"]>): void => 
    this.updateFileVisibility(updates);
  
  public updateLoopPointsState = (updates: Partial<AppState["loopPoints"]>): void => 
    this.updateLoopPoints(updates);
  
  public updatePanVolumeState = (updates: Partial<AppState["panVolume"]>): void => 
    this.updatePanVolume(updates);
  
  public updateVisualState = (updates: Partial<AppState["visual"]>): void => 
    this.updateVisual(updates);
  
  public updateEvaluationState = (updates: Partial<AppState["evaluation"]>): void => 
    this.updateEvaluation(updates);

  /* ====== Onset Marker Mapping ====== */
  /** Assign or update the onset marker style for a file. */
  public setOnsetMarkerForFile = (fileId: string, style: OnsetMarkerStyle): void => {
    this.state.visual.fileOnsetMarkers[fileId] = style;
    this.notify();
  };

  /** Get the onset marker style for a file, if any. */
  public getOnsetMarkerForFile = (fileId: string): OnsetMarkerStyle | undefined => {
    return this.state.visual.fileOnsetMarkers[fileId];
  };

  /**
   * Ensure a unique marker is assigned to the given file if missing.
   * Uses shape → variant fallback strategy across loaded files.
   */
  public ensureOnsetMarkerForFile = (fileId: string): OnsetMarkerStyle => {
    const existing = this.state.visual.fileOnsetMarkers[fileId];
    if (existing) return existing;

    const usedKeys = new Set(
      Object.values(this.state.visual.fileOnsetMarkers).map(
        (s) => `${s.shape}:${s.variant}`
      )
    );

    // 1) Try filled variants first
    let picked: OnsetMarkerStyle | null = null;
    for (const shape of ONSET_MARKER_SHAPES) {
      const key = `${shape}:filled`;
      if (!usedKeys.has(key)) {
        picked = { shape: shape as OnsetMarkerStyle["shape"], variant: "filled", size: 12, strokeWidth: 2 };
        break;
      }
    }
    // 2) Then outlined variants
    if (!picked) {
      for (const shape of ONSET_MARKER_SHAPES) {
        const key = `${shape}:outlined`;
        if (!usedKeys.has(key)) {
          picked = { shape: shape as OnsetMarkerStyle["shape"], variant: "outlined", size: 12, strokeWidth: 2 };
          break;
        }
      }
    }
    // 3) Fallback: reuse first with outlined if everything used
    if (!picked) {
      const shape = ONSET_MARKER_SHAPES[Object.keys(this.state.visual.fileOnsetMarkers).length % ONSET_MARKER_SHAPES.length];
      picked = { shape: shape as OnsetMarkerStyle["shape"], variant: "outlined", size: 12, strokeWidth: 2 };
    }

    this.state.visual.fileOnsetMarkers[fileId] = picked;
    this.notify();
    return picked;
  };

  /* ====== State Synchronization Utilities ====== */
  public preserveStateForBatch<T>(operation: () => T): T {
    return batchStateUpdate(this.state, () => this.notify(), operation);
  }

  /* ====== File Visibility Operations (using SetManager) ====== */
  public syncFileVisibility = (fileIds: string[]): void => 
    this.fileVisibilityManager.sync(fileIds);
  
  public addFileToVisibility = (fileId: string): void => 
    this.fileVisibilityManager.add(fileId);
  
  public removeFileFromVisibility = (fileId: string): void => 
    this.fileVisibilityManager.remove(fileId);
  
  public toggleFileVisibility = (fileId: string): boolean => 
    this.fileVisibilityManager.toggle(fileId);

  /* ====== Pan/Volume Operations ====== */
  public setFilePanValue(fileId: string, panValue: number): void {
    this.state.panVolume.filePanValues[fileId] = panValue;
    this.notify();
  }

  public registerFilePanHandler(
    fileId: string,
    handler: (pan: number | null) => void
  ): void {
    this.state.panVolume.filePanStateHandlers[fileId] = handler;
  }

  public unregisterFilePanHandler(fileId: string): void {
    delete this.state.panVolume.filePanStateHandlers[fileId];
  }

  public syncPanValues(panValue: number | null): void {
    Object.values(this.state.panVolume.filePanStateHandlers).forEach(
      (handler) => handler(panValue)
    );
  }

  public setFileMuteState(fileId: string, muted: boolean): void {
    this.state.panVolume.fileMuteStates[fileId] = muted;
    this.notify();
  }

  public getFileMuteState(fileId: string): boolean {
    return this.state.panVolume.fileMuteStates[fileId] || false;
  }

  /* ====== Loop Points Operations ====== */
  public setLoopPoints(a: number | null, b: number | null): void {
    const [normalizedA, normalizedB] = normalizeLoopPoints(a, b);
    this.state.loopPoints = { a: normalizedA, b: normalizedB };
    this.notify();
  }

  public clearLoopPoints(): void {
    this.setLoopPoints(null, null);
  }

  public setLoopPointsFromPercentages(
    aPercent: number | null,
    bPercent: number | null
  ): void {
    const { duration } = this.state.playback;
    if (duration === 0) return;

    const points = percentagesToLoopPoints(
      { a: aPercent, b: bPercent },
      duration
    );
    this.setLoopPoints(points.a, points.b);
  }

  /* ====== Config & Reset ====== */
  public updateConfig(updates: Partial<StateManagerConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  public resetState(): void {
    this.state = this.createInitialState();
    this.fileVisibilityManager.clear();
    this.notify();
  }

  /* ====== Listener Management (using ListenerManager) ====== */
  public onStateChange = (callback: () => void): void => 
    this.listeners.add(callback);
  
  public offStateChange = (callback: () => void): void => 
    this.listeners.remove(callback);

  private notify(): void {
    if (this.state.ui.isBatchLoading) return;
    this.listeners.notify();
  }
}

/**
 * Create a new state manager instance
 */
export function createStateManager(
  config?: Partial<StateManagerConfig>
): StateManager {
  return new StateManager(config);
}
