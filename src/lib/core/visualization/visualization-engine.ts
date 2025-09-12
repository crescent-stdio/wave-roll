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
import type { PianoRollInstance as VizPianoRollInstance } from "./piano-roll";
import { overlapping } from "@/core/controls/utils/overlap";
import { COLOR_OVERLAP } from "@/lib/core/constants";

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
  overlapColor: parseInt(COLOR_OVERLAP.replace("#", ""), 16),
};

/**
 * Visual update parameters - re-export for compatibility
 */
export interface VisualUpdateParams extends CoreVisualUpdateParams {
  zoomLevel: number;
}

// Piano roll instance type alias for backward-compatibility
export type PianoRollInstance = VizPianoRollInstance;

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
      // // console.log("[VisualizationEngine] onVisualUpdate", params);

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
    console.log('[VisualizationEngine] updateVisualization called with', visibleNotes.length, 'visible notes, audioNotesOverride:', audioNotesOverride ? audioNotesOverride.length : 'none');
    // ------------------------------------------------------------
    // Conditional overlap recoloring (legacy path). If the calling code
    // already provided pre-split overlap segments, we can skip this pass by
    // setting `enableOverlapDetection = false` in the config.
    // ------------------------------------------------------------
    let recolored: typeof visibleNotes = visibleNotes;

    if (this.config.enableOverlapDetection) {
      const trackMap: Record<string, { start: number; end: number }[]> = {};
      visibleNotes.forEach(({ note, fileId }) => {
        if (!fileId) return;
        const end = note.time + note.duration;
        (trackMap[fileId] = trackMap[fileId] || []).push({
          start: note.time,
          end,
        });
      });

      const overlaps = overlapping(
        Object.values(trackMap).map((intervals) => ({
          id: "overlap",
          intervals,
        }))
      );

      recolored = visibleNotes.map((cn) => {
        const noteStart = cn.note.time;
        const noteEnd = noteStart + cn.note.duration;
        const intersects = overlaps.some(
          (iv) => iv.start < noteEnd && iv.end > noteStart
        );
        return intersects ? { ...cn, color: this.config.overlapColor } : cn;
      });
    }

    // Update piano roll visualization
    await this.pianoRollManager.updateVisualization(recolored);

    // Update audio with appropriate notes
    const audioNotes =
      audioNotesOverride ??
      recolored.filter((cn) => !cn.isMuted).map((cn) => cn.note);

    console.log('[VisualizationEngine] Calling coreEngine.updateAudio with', audioNotes.length, 'audio notes');
    await this.coreEngine.updateAudio(audioNotes);
  }

  /**
   * Get piano roll instance
   */
  public getPianoRollInstance(): PianoRollInstance | null {
    // PianoRollManager stores the object created by createPianoRoll(), which is the
    // visualizer-facing PianoRollInstance. Cast for ergonomic downstream typing.
    return this.pianoRollManager.getPianoRollInstance() as unknown as PianoRollInstance | null;
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

  /**
   * Set pan for a specific MIDI file track.
   */
  public setFilePan(fileId: string, pan: number): void {
    this.coreEngine.setFilePan(fileId, pan);
  }
  
  /**
   * Set mute state for a specific MIDI file track.
   */
  public setFileMute(fileId: string, mute: boolean): void {
    this.coreEngine.setFileMute(fileId, mute);
  }
  
  /**
   * Refresh WAV/audio players from registry (for mute state updates)
   */
  public refreshAudioPlayers(): void {
    this.coreEngine.refreshAudioPlayers();
  }

  /** Set per-file MIDI volume */
  public setFileVolume(fileId: string, volume: number): void {
    this.coreEngine.setFileVolume(fileId, volume);
  }

  /** Set per-file WAV volume */
  public setWavVolume(fileId: string, volume: number): void {
    this.coreEngine.setWavVolume(fileId, volume);
  }

  public setTempo(tempo: number): void {
    this.coreEngine.setTempo(tempo);
    // Immediately notify visual update callbacks so UI (seekbar/time)
    // can reflect the new effective duration/tempo even when paused.
    const state = this.coreEngine.getState();
    this.notifyVisualUpdateCallbacks({
      currentTime: state.currentTime,
      duration: state.duration,
      zoomLevel: this.pianoRollManager.getZoom(),
      isPlaying: state.isPlaying,
      volume: state.volume,
      tempo: state.tempo,
      pan: state.pan || 0,
    });
  }

  /**
   * Set playback rate as percentage (10-200, 100 = normal speed)
   */
  public setPlaybackRate(rate: number): void {
    this.coreEngine.setPlaybackRate(rate);
    
    // Immediately notify visual update callbacks
    // This ensures UI reflects the rate change even when paused
    const state = this.coreEngine.getState();
    this.notifyVisualUpdateCallbacks({
      currentTime: state.currentTime,
      duration: state.duration,
      zoomLevel: 1.0, // Default zoom level
      isPlaying: state.isPlaying,
      volume: state.volume,
      tempo: state.tempo,
      pan: state.pan || 0,
    });
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
  public setLoopPoints(start: number | null, end: number | null, preservePosition: boolean = false): void {
    this.coreEngine.setLoopPoints(start, end, preservePosition);
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
