/**
 * VisualizationEngine - Legacy wrapper around CorePlaybackEngine
 * Maintains backward compatibility while delegating to unified engine
 */

import { NoteData } from "@/lib/midi/types";
import { AudioPlayerState } from "@/core/audio";
import {
  CorePlaybackEngine,
  createCorePlaybackEngine,
  VisualUpdateParams as CoreVisualUpdateParams,
} from "@/core/playback";
import {
  PianoRollManager,
  createPianoRollManager,
  ColoredNote as CoreColoredNote,
  DEFAULT_PIANO_ROLL_CONFIG,
} from "@/core/playback";

export type ColoredNote = CoreColoredNote;

/**
 * Default piano roll configuration - re-export for compatibility
 */
export { DEFAULT_PIANO_ROLL_CONFIG };

/**
 * Visualization engine configuration
 */
export interface VisualizationEngineConfig {
  defaultPianoRollConfig: import("@/core/playback").PianoRollConfig;
  updateInterval: number;
  enableOverlapDetection: boolean;
  overlapColor: number;
}

/**
 * Default visualization configuration
 */
export const DEFAULT_VISUALIZATION_CONFIG: VisualizationEngineConfig = {
  defaultPianoRollConfig: DEFAULT_PIANO_ROLL_CONFIG,
  updateInterval: 50,
  enableOverlapDetection: true,
  overlapColor: 0x800080,
};

/**
 * Visual update parameters - re-export for compatibility
 */
export interface VisualUpdateParams extends CoreVisualUpdateParams {
  zoomLevel: number;
}

/**
 * Piano roll instance interface for compatibility
 */
export interface PianoRollInstance {
  setNotes(notes: NoteData[]): void;
  setTime(time: number): void;
  zoomX?(scale: number): void;
  getState?(): { zoomX: number };
  onTimeChange?(callback: (time: number) => void): void;
  setMinorTimeStep?(step: number): void;
}

/**
 * Main visualization engine class - Thin wrapper around CorePlaybackEngine
 */
export class VisualizationEngine {
  private coreEngine: CorePlaybackEngine;
  private pianoRollManager: PianoRollManager;
  private config: VisualizationEngineConfig;
  private visualUpdateCallbacks: ((params: VisualUpdateParams) => void)[] = [];

  constructor(config: Partial<VisualizationEngineConfig> = {}) {
    this.config = { ...DEFAULT_VISUALIZATION_CONFIG, ...config };

    // Create core engine without state manager (for backward compatibility)
    this.coreEngine = createCorePlaybackEngine(undefined, {
      updateInterval: this.config.updateInterval,
      enableStateSync: false,
    });

    // Create piano roll manager
    this.pianoRollManager = createPianoRollManager(
      this.config.defaultPianoRollConfig,
      {
        enableOverlapDetection: this.config.enableOverlapDetection,
        overlapColor: this.config.overlapColor,
      }
    );

    // Set up visual update forwarding
    this.coreEngine.onVisualUpdate((params) => {
      // Debug logging removed - was causing console spam
      // console.log("[VisualizationEngine] onVisualUpdate", params);

      const extendedParams: VisualUpdateParams = {
        ...params,
        zoomLevel: this.pianoRollManager.getZoom(),
      };
      this.notifyVisualUpdateCallbacks(extendedParams);
    });
  }

  /**
   * Initialize piano roll with a container element
   */
  public async initializePianoRoll(
    container: HTMLElement,
    notes: NoteData[],
    pianoRollConfig: Partial<import("@/core/playback").PianoRollConfig> = {}
  ): Promise<void> {
    const config = {
      ...this.config.defaultPianoRollConfig,
      ...pianoRollConfig,
    };

    // Update piano roll manager config
    this.pianoRollManager.updateConfig(config);

    // Initialize piano roll
    await this.pianoRollManager.initialize(container, notes);

    // Initialize core engine with piano roll manager
    await this.coreEngine.initialize(this.pianoRollManager);
  }

  /**
   * Update visualization with new note data
   */
  public async updateVisualization(
    visibleNotes: ColoredNote[],
    audioNotesOverride?: NoteData[]
  ): Promise<void> {
    // Update piano roll visualization
    await this.pianoRollManager.updateVisualization(visibleNotes);

    // Update audio with appropriate notes
    const audioNotes =
      audioNotesOverride ??
      visibleNotes.filter((cn) => !cn.isMuted).map((cn) => cn.note);

    await this.coreEngine.updateAudio(audioNotes);
  }

  /**
   * Get piano roll instance
   */
  public getPianoRollInstance(): PianoRollInstance | null {
    return this.pianoRollManager.getPianoRollInstance() as PianoRollInstance | null;
  }

  /**
   * Set minor time step
   */
  public setMinorTimeStep(step: number): void {
    this.pianoRollManager.updateConfig({ minorTimeStep: step });
  }

  /**
   * Get current zoom level
   */
  public getZoomLevel(): number {
    return this.pianoRollManager.getZoom();
  }

  /**
   * Set zoom level
   */
  public setZoomLevel(scale: number): void {
    this.pianoRollManager.setZoom(scale);
  }

  /**
   * Set playhead time
   */
  public setTime(time: number): void {
    this.pianoRollManager.setTime(time);
  }

  /**
   * Get current audio player state
   */
  public getAudioPlayerState(): AudioPlayerState | null {
    return this.coreEngine.getState();
  }

  /**
   * Control audio playback - Delegate to core engine
   */
  public async play(): Promise<void> {
    await this.coreEngine.play();
  }

  public pause(): void {
    this.coreEngine.pause();
  }

  public seek(time: number, updateVisual: boolean = true): void {
    this.coreEngine.seek(time, updateVisual);
  }

  public setVolume(volume: number): void {
    this.coreEngine.setVolume(volume);
  }

  public setPan(pan: number): void {
    this.coreEngine.setPan(pan);
  }

  public setTempo(tempo: number): void {
    this.coreEngine.setTempo(tempo);
  }

  /**
   * Register visual update callback
   */
  public onVisualUpdate(callback: (params: VisualUpdateParams) => void): void {
    this.visualUpdateCallbacks.push(callback);
  }

  /**
   * Start visual update loop
   */
  public startVisualUpdateLoop(): void {
    // Core engine already manages update loop
    // This is kept for compatibility
  }

  /**
   * Stop visual update loop
   */
  public stopVisualUpdateLoop(): void {
    // Core engine manages this internally
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.coreEngine.destroy();
    this.pianoRollManager.destroy();
    this.visualUpdateCallbacks = [];
  }

  /**
   * Check if visualization is initialized
   */
  public isInitialized(): boolean {
    return this.coreEngine.isInitialized();
  }

  /**
   * Get engine info
   */
  public getEngineInfo(): { width: number; height: number; fps: number } {
    return {
      width: this.config.defaultPianoRollConfig.width,
      height: this.config.defaultPianoRollConfig.height,
      fps: Math.round(1000 / this.config.updateInterval),
    };
  }

  /**
   * Proxy - enable UI to access underlying player state
   */
  public getState(): AudioPlayerState {
    return this.coreEngine.getState();
  }

  /**
   * Proxy repeat toggle to underlying audio player
   */
  public toggleRepeat(enabled: boolean): void {
    this.coreEngine.toggleRepeat(enabled);
  }

  /**
   * Proxy custom loop points (A-B) to underlying audio player
   */
  public setLoopPoints(start: number | null, end: number | null): void {
    this.coreEngine.setLoopPoints(start, end);
  }

  /**
   * Notify visual update callbacks
   */
  private notifyVisualUpdateCallbacks(params: VisualUpdateParams): void {
    this.visualUpdateCallbacks.forEach((callback) => {
      try {
        callback(params);
      } catch (error) {
        console.error("Error in visual update callback:", error);
      }
    });
  }
}

// Export utility functions

/**
 * Create a new visualization engine instance
 */
export function createVisualizationEngine(
  config?: Partial<VisualizationEngineConfig>
): VisualizationEngine {
  return new VisualizationEngine(config);
}
