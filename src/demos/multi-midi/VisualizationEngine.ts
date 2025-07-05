/**
 * VisualizationEngine - Handles piano roll management and visualization logic
 * Extracted from MultiMidiDemo to provide centralized visualization controls
 */

import { NoteData } from "@/types";
import { createPianoRoll } from "@/components/piano-roll";
import {
  createAudioPlayer,
  AudioPlayerControls,
} from "@/components/audio-player";
import { detectOverlappingNotes, blendColorsAverage } from "./ColorUtils";
import { VisualState } from "./StateManager";

// Types and interfaces for visualization

/**
 * Configuration for piano roll visualization
 */
export interface PianoRollConfig {
  width: number;
  height: number;
  backgroundColor: number;
  playheadColor: number;
  showPianoKeys: boolean;
  noteRange: { min: number; max: number };
  minorTimeStep: number;
}

/**
 * Represents a note with associated color and file metadata
 */
export interface ColoredNote {
  note: NoteData;
  color: number;
  fileId: string;
}

/**
 * Visual update parameters for synchronization
 */
export interface VisualUpdateParams {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  zoomLevel: number;
}

/**
 * Piano roll instance interface (based on piano-roll.ts)
 */
export interface PianoRollInstance {
  setNotes(notes: NoteData[]): void;
  setTime(time: number): void;
  getState(): { zoomX: number; [key: string]: any };
  zoomX(factor: number): void;
  resetView(): void;
  setMinorTimeStep?(timeStep: number): void;
  onTimeChange?(callback: (time: number) => void): void;
}

/**
 * Audio player state for preservation during updates
 */
export interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  tempo: number;
  volume: number;
  isRepeating: boolean;
  pan: number;
}

/**
 * Visualization engine configuration
 */
export interface VisualizationEngineConfig {
  defaultPianoRollConfig: PianoRollConfig;
  updateInterval: number;
  enableOverlapDetection: boolean;
  overlapColor: number;
}

// Default configurations

export const DEFAULT_PIANO_ROLL_CONFIG: PianoRollConfig = {
  width: 800,
  height: 380,
  backgroundColor: 0xffffff,
  playheadColor: 0xff4444,
  showPianoKeys: true,
  noteRange: { min: 21, max: 108 },
  minorTimeStep: 0.1,
};

export const DEFAULT_VISUALIZATION_CONFIG: VisualizationEngineConfig = {
  defaultPianoRollConfig: DEFAULT_PIANO_ROLL_CONFIG,
  updateInterval: 100,
  enableOverlapDetection: true,
  overlapColor: 0xaaaaaa,
};

/**
 * Main visualization engine class
 */
export class VisualizationEngine {
  private pianoRollInstance: PianoRollInstance | null = null;
  private audioPlayer: AudioPlayerControls | null = null;
  private pianoRollContainer: HTMLElement | null = null;
  private currentNoteColors: number[] = [];
  private config: VisualizationEngineConfig;
  private visualUpdateCallbacks: ((params: VisualUpdateParams) => void)[] = [];
  private updateLoopId: number | null = null;

  constructor(config: Partial<VisualizationEngineConfig> = {}) {
    this.config = { ...DEFAULT_VISUALIZATION_CONFIG, ...config };
  }

  /**
   * Initialize piano roll with a container element
   */
  public async initializePianoRoll(
    container: HTMLElement,
    notes: NoteData[],
    pianoRollConfig: Partial<PianoRollConfig> = {}
  ): Promise<void> {
    this.pianoRollContainer = container;

    const config = {
      ...this.config.defaultPianoRollConfig,
      ...pianoRollConfig,
    };

    // Create piano roll with note renderer using current colors
    this.pianoRollInstance = await createPianoRoll(container, notes, {
      ...config,
      width: container.clientWidth || config.width,
      noteRenderer: (_note: NoteData, index: number) =>
        this.currentNoteColors[index],
    });

    // Set up time change callback
    this.pianoRollInstance.onTimeChange?.((time: number) => {
      this.audioPlayer?.seek(time, false);
    });

    // Apply minor time step if supported
    if (this.pianoRollInstance.setMinorTimeStep) {
      this.pianoRollInstance.setMinorTimeStep(config.minorTimeStep);
    }
  }

  /**
   * Update visualization with new note data
   */
  public async updateVisualization(visibleNotes: ColoredNote[]): Promise<void> {
    if (visibleNotes.length === 0) {
      await this.handleEmptyVisualization();
      return;
    }

    // Process notes and colors with overlap detection
    const { notes, noteColors } = this.processNotesWithColors(visibleNotes);

    if (this.pianoRollInstance) {
      // Update existing piano roll
      await this.updateExistingPianoRoll(notes, noteColors);
    } else {
      // Create new piano roll
      await this.createNewPianoRoll(notes, noteColors);
    }

    // Start the visual update loop
    this.startVisualUpdateLoop();
  }

  /**
   * Handle empty visualization state
   */
  private async handleEmptyVisualization(): Promise<void> {
    // Pause audio player if active
    this.audioPlayer?.pause();

    // Keep piano roll visible but empty
    if (this.pianoRollContainer) {
      this.pianoRollContainer.style.display = "block";
    }

    // Clear notes from piano roll
    if (this.pianoRollInstance) {
      this.currentNoteColors = [];
      this.pianoRollInstance.setNotes([]);
    }

    // Recreate audio player with empty notes
    await this.recreateAudioPlayer([]);
  }

  /**
   * Process notes and generate colors with overlap detection
   */
  private processNotesWithColors(visibleNotes: ColoredNote[]): {
    notes: NoteData[];
    noteColors: number[];
  } {
    const notes: NoteData[] = [];
    const noteColors: number[] = [];

    if (this.config.enableOverlapDetection) {
      // Detect overlapping notes
      const overlappingIndices = detectOverlappingNotes(visibleNotes);

      visibleNotes.forEach((item, idx) => {
        notes.push(item.note);

        // Calculate color based on overlaps
        const mixColors: number[] = [item.color];
        const mixWeights: number[] = [item.note.velocity ?? 1];

        // Find overlapping notes from different files
        for (let j = 0; j < visibleNotes.length; j++) {
          if (j === idx) continue;

          const other = visibleNotes[j];
          if (this.notesOverlap(item, other)) {
            mixColors.push(other.color);
            mixWeights.push(other.note.velocity ?? 1);
          }
        }

        // Apply color blending or overlap color
        if (mixColors.length > 1) {
          noteColors.push(this.config.overlapColor);
        } else {
          noteColors.push(item.color);
        }
      });
    } else {
      // Simple mapping without overlap detection
      visibleNotes.forEach((item) => {
        notes.push(item.note);
        noteColors.push(item.color);
      });
    }

    return { notes, noteColors };
  }

  /**
   * Check if two notes overlap
   */
  private notesOverlap(noteA: ColoredNote, noteB: ColoredNote): boolean {
    return (
      noteA.fileId !== noteB.fileId &&
      noteA.note.midi === noteB.note.midi &&
      noteA.note.time < noteB.note.time + noteB.note.duration &&
      noteB.note.time < noteA.note.time + noteA.note.duration
    );
  }

  /**
   * Update existing piano roll with new notes and colors
   */
  private async updateExistingPianoRoll(
    notes: NoteData[],
    noteColors: number[]
  ): Promise<void> {
    if (!this.pianoRollInstance) return;

    // Preserve current audio player state
    const prevState = this.audioPlayer?.getState();

    // Update colors and notes
    this.currentNoteColors = noteColors;
    this.pianoRollInstance.setNotes(notes);

    // Show piano roll container
    if (this.pianoRollContainer) {
      this.pianoRollContainer.style.display = "block";
    }

    // Recreate audio player with new notes
    await this.recreateAudioPlayer(notes, prevState);
  }

  /**
   * Create new piano roll instance
   */
  private async createNewPianoRoll(
    notes: NoteData[],
    noteColors: number[]
  ): Promise<void> {
    if (!this.pianoRollContainer) {
      throw new Error("Piano roll container not initialized");
    }

    // Preserve current state
    const prevState = this.audioPlayer?.getState();
    const prevZoomX = this.pianoRollInstance?.getState?.().zoomX ?? 1;

    // Clean up existing instances
    if (this.audioPlayer) {
      this.audioPlayer.destroy();
      this.audioPlayer = null;
    }

    // Clear container
    this.pianoRollContainer.innerHTML = "";

    // Create new container for piano roll
    const pianoRollDiv = document.createElement("div");
    pianoRollDiv.style.cssText = `
      width: 100%;
      height: 400px;
      border: 1px solid #ddd;
      border-radius: 8px;
      margin-bottom: 20px;
      background: #ffffff;
    `;
    this.pianoRollContainer.appendChild(pianoRollDiv);

    // Store colors for note renderer
    this.currentNoteColors = noteColors;

    // Initialize piano roll
    await this.initializePianoRoll(pianoRollDiv, notes);

    // Create audio player
    await this.recreateAudioPlayer(notes, prevState);

    // Restore zoom level
    if (prevZoomX !== 1 && this.pianoRollInstance?.zoomX) {
      this.pianoRollInstance.zoomX(prevZoomX);
    }
  }

  /**
   * Recreate audio player with new notes
   */
  private async recreateAudioPlayer(
    notes: NoteData[],
    prevState?: AudioPlayerState
  ): Promise<void> {
    if (!this.pianoRollInstance) return;

    // Default state values
    const defaultState: AudioPlayerState = {
      isPlaying: false,
      currentTime: 0,
      tempo: 120,
      volume: 0.7,
      isRepeating: false,
      pan: 0,
    };

    const state = prevState || defaultState;

    // Destroy existing audio player
    if (this.audioPlayer) {
      this.audioPlayer.destroy();
      this.audioPlayer = null;
    }

    // Create new audio player
    this.audioPlayer = createAudioPlayer(notes, this.pianoRollInstance, {
      tempo: state.tempo,
      volume: state.volume,
      repeat: state.isRepeating,
    });

    // Restore pan immediately
    this.audioPlayer.setPan(state.pan);

    // Restore playback state with delay for initialization
    if (prevState) {
      setTimeout(async () => {
        if (this.audioPlayer && this.pianoRollInstance) {
          this.audioPlayer.seek(state.currentTime, false);
          this.pianoRollInstance.setTime(state.currentTime);

          if (state.isPlaying) {
            try {
              await this.audioPlayer.play();
            } catch (error) {
              console.error("Failed to resume playback:", error);
            }
          }
        }
      }, 100);
    }
  }

  /**
   * Get current piano roll zoom level
   */
  public getZoomLevel(): number {
    return this.pianoRollInstance?.getState?.().zoomX ?? 1;
  }

  /**
   * Set zoom level
   */
  public setZoomLevel(zoom: number): void {
    if (!this.pianoRollInstance?.zoomX) return;

    const currentZoom = this.getZoomLevel();
    const factor = zoom / currentZoom;
    this.pianoRollInstance.zoomX(factor);
  }

  /**
   * Reset piano roll view (zoom and pan)
   */
  public resetView(): void {
    this.pianoRollInstance?.resetView();
  }

  /**
   * Set minor time step for piano roll
   */
  public setMinorTimeStep(timeStep: number): void {
    if (this.pianoRollInstance?.setMinorTimeStep) {
      this.pianoRollInstance.setMinorTimeStep(timeStep);
    }
  }

  /**
   * Get current audio player state
   */
  public getAudioPlayerState(): AudioPlayerState | null {
    if (!this.audioPlayer) return null;

    const state = this.audioPlayer.getState();
    return {
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      tempo: state.tempo,
      volume: state.volume,
      isRepeating: state.isRepeating,
      pan: state.pan,
    };
  }

  /**
   * Control audio playback
   */
  public async play(): Promise<void> {
    if (this.audioPlayer) {
      await this.audioPlayer.play();
    }
  }

  public pause(): void {
    if (this.audioPlayer) {
      this.audioPlayer.pause();
    }
  }

  public seek(time: number, updateVisual: boolean = true): void {
    if (this.audioPlayer) {
      this.audioPlayer.seek(time, updateVisual);
    }
  }

  public setVolume(volume: number): void {
    if (this.audioPlayer) {
      this.audioPlayer.setVolume(volume);
    }
  }

  public setPan(pan: number): void {
    if (this.audioPlayer) {
      this.audioPlayer.setPan(pan);
    }
  }

  public setTempo(tempo: number): void {
    if (this.audioPlayer) {
      this.audioPlayer.setTempo(tempo);
    }
  }

  /**
   * Start visual update loop for real-time synchronization
   */
  public startVisualUpdateLoop(): void {
    this.stopVisualUpdateLoop();

    this.updateLoopId = window.setInterval(() => {
      const state = this.getAudioPlayerState();
      if (!state) return;

      const zoomLevel = this.getZoomLevel();
      const updateParams: VisualUpdateParams = {
        currentTime: state.currentTime,
        duration: this.audioPlayer?.getState().duration ?? 0,
        isPlaying: state.isPlaying,
        zoomLevel: zoomLevel,
      };

      // Notify all registered callbacks
      this.visualUpdateCallbacks.forEach((callback) => {
        try {
          callback(updateParams);
        } catch (error) {
          console.error("Error in visual update callback:", error);
        }
      });
    }, this.config.updateInterval);
  }

  /**
   * Stop visual update loop
   */
  public stopVisualUpdateLoop(): void {
    if (this.updateLoopId !== null) {
      clearInterval(this.updateLoopId);
      this.updateLoopId = null;
    }
  }

  /**
   * Register callback for visual updates
   */
  public onVisualUpdate(callback: (params: VisualUpdateParams) => void): void {
    this.visualUpdateCallbacks.push(callback);
  }

  /**
   * Unregister visual update callback
   */
  public offVisualUpdate(callback: (params: VisualUpdateParams) => void): void {
    const index = this.visualUpdateCallbacks.indexOf(callback);
    if (index !== -1) {
      this.visualUpdateCallbacks.splice(index, 1);
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<VisualizationEngineConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  public getConfig(): VisualizationEngineConfig {
    return { ...this.config };
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.stopVisualUpdateLoop();

    if (this.audioPlayer) {
      this.audioPlayer.destroy();
      this.audioPlayer = null;
    }

    this.pianoRollInstance = null;
    this.pianoRollContainer = null;
    this.currentNoteColors = [];
    this.visualUpdateCallbacks = [];
  }

  /**
   * Check if visualization is initialized
   */
  public isInitialized(): boolean {
    return this.pianoRollInstance !== null;
  }

  /**
   * Get current note colors
   */
  public getCurrentNoteColors(): number[] {
    return [...this.currentNoteColors];
  }

  /**
   * Get piano roll container element
   */
  public getPianoRollContainer(): HTMLElement | null {
    return this.pianoRollContainer;
  }

  /**
   * Get piano roll instance
   */
  public getPianoRollInstance(): PianoRollInstance | null {
    return this.pianoRollInstance;
  }

  /**
   * Proxy - enable UI to access underlying player state
   */
  public getState() {
    return this.audioPlayer?.getState();
  }

  /**
   * Proxy repeat toggle to underlying audio player
   */
  public toggleRepeat(enabled: boolean): void {
    this.audioPlayer?.toggleRepeat(enabled);
  }

  /**
   * Proxy custom loop points (A–B) to underlying audio player
   */
  public setLoopPoints(start: number | null, end: number | null): void {
    this.audioPlayer?.setLoopPoints(start, end);
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

/**
 * Helper function to convert hex color to RGB components
 */
export function hexToRgb(hex: number): [number, number, number] {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return [r, g, b];
}

/**
 * Helper function to convert RGB to hex color
 */
export function rgbToHex(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

/**
 * Validate piano roll configuration
 */
export function validatePianoRollConfig(
  config: Partial<PianoRollConfig>
): boolean {
  if (config.width !== undefined && config.width <= 0) return false;
  if (config.height !== undefined && config.height <= 0) return false;
  if (config.noteRange) {
    if (config.noteRange.min < 0 || config.noteRange.max > 127) return false;
    if (config.noteRange.min >= config.noteRange.max) return false;
  }
  if (config.minorTimeStep !== undefined && config.minorTimeStep <= 0)
    return false;

  return true;
}
