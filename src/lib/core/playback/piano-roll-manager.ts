/**
 * PianoRollManager - Manages piano roll visualization independently from playback
 *
 * Handles all visual aspects of the piano roll including:
 * - Note rendering with colors
 * - Overlap detection
 * - Zoom and pan controls
 * - Visual state management
 */

import { ControlChangeEvent, NoteData } from "@/lib/midi/types";
import { createPianoRoll } from "@/core/visualization/piano-roll";
// (Overlap detection logic is handled upstream in the multi-MIDI player)

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
  /** Whether to show waveform band at the bottom (default: true) */
  showWaveformBand?: boolean;
}

/**
 * Note with color information
 */
export interface ColoredNote {
  note: NoteData;
  color: number;
  fileId: string;
  isMuted: boolean;
}

/**
 * Piano roll instance interface
 */
export interface PianoRollInstance {
  setNotes(notes: NoteData[]): void;
  setControlChanges?(controlChanges: ControlChangeEvent[]): void;
  setTime(time: number): void;
  zoomX?(scale: number): void;
  getState?(): { zoomX: number };
  onTimeChange?(callback: (time: number) => void): void;
  setMinorTimeStep?(step: number): void;
  destroy?(): void;
}

/**
 * Default piano roll configuration
 */
export const DEFAULT_PIANO_ROLL_CONFIG: PianoRollConfig = {
  width: 800,
  height: 400,
  backgroundColor: 0xffffff,
  playheadColor: 0x1e40af,
  showPianoKeys: true,
  noteRange: { min: 21, max: 108 },
  minorTimeStep: 4,
};

/**
 * PianoRollManager - Manages visual aspects of piano roll
 */
export class PianoRollManager {
  private pianoRollInstance: PianoRollInstance | null = null;
  private pianoRollContainer: HTMLElement | null = null;
  private currentNoteColors: number[] = [];
  private config: PianoRollConfig;
  private enableOverlapDetection: boolean;
  private overlapColor: number;

  constructor(
    config: Partial<PianoRollConfig> = {},
    options: {
      enableOverlapDetection?: boolean;
      overlapColor?: number;
    } = {}
  ) {
    this.config = { ...DEFAULT_PIANO_ROLL_CONFIG, ...config };
    this.enableOverlapDetection = options.enableOverlapDetection ?? true;
    this.overlapColor = options.overlapColor ?? 0x800080;
  }

  /**
   * Initialize piano roll with container
   */
  public async initialize(
    container: HTMLElement,
    notes: NoteData[] = []
  ): Promise<void> {
    this.pianoRollContainer = container;

    const config = {
      ...this.config,
      width: container.clientWidth || this.config.width,
      noteRenderer: (_note: NoteData, index: number) =>
        this.currentNoteColors[index] || 0x666666,
    };

    this.pianoRollInstance = await createPianoRoll(container, notes, config);

    // Apply minor time step if supported
    if (this.pianoRollInstance.setMinorTimeStep) {
      this.pianoRollInstance.setMinorTimeStep(this.config.minorTimeStep);
    }
  }

  /**
   * Update visualization with colored notes
   */
  public async updateVisualization(coloredNotes: ColoredNote[]): Promise<void> {
    if (!this.pianoRollInstance) {
      throw new Error("PianoRoll not initialized");
    }

    // Handle empty visualization
    if (coloredNotes.length === 0) {
      this.currentNoteColors = [];
      this.pianoRollInstance.setNotes([]);
      return;
    }

    // Process notes and colors
    const { notes, noteColors } = this.processNotesWithColors(coloredNotes);

    // Update visualization
    this.currentNoteColors = noteColors;
    this.pianoRollInstance.setNotes(notes);
  }

  /**
   * Process notes with color handling and overlap detection
   */
  private processNotesWithColors(coloredNotes: ColoredNote[]): {
    notes: NoteData[];
    noteColors: number[];
  } {
    const notes: NoteData[] = [];
    const noteColors: number[] = [];

    // Extract notes and base colors
    coloredNotes.forEach((coloredNote) => {
      notes.push(coloredNote.note);
      noteColors.push(coloredNote.color);
    });

    // Apply overlap detection if enabled
    // Overlap detection is handled upstream where overlapping segments are
    // rendered as independent notes with a distinct color. We therefore keep
    // the original per-note colors intact here.

    return { notes, noteColors };
  }

  /**
   * Set playhead time position
   */
  public setTime(time: number): void {
    this.pianoRollInstance?.setTime(time);
  }

  /**
   * Set zoom level
   */
  public setZoom(scale: number): void {
    if (this.pianoRollInstance?.zoomX) {
      this.pianoRollInstance.zoomX(scale);
    }
  }

  /**
   * Get current zoom level
   */
  public getZoom(): number {
    if (this.pianoRollInstance?.getState) {
      return this.pianoRollInstance.getState().zoomX || 1;
    }
    return 1;
  }

  /**
   * Update piano roll configuration
   */
  public updateConfig(config: Partial<PianoRollConfig>): void {
    this.config = { ...this.config, ...config };

    // Apply minor time step if changed
    if (
      config.minorTimeStep !== undefined &&
      this.pianoRollInstance?.setMinorTimeStep
    ) {
      this.pianoRollInstance.setMinorTimeStep(config.minorTimeStep);
    }
  }

  /**
   * Get piano roll instance for direct access
   */
  public getPianoRollInstance(): PianoRollInstance | null {
    return this.pianoRollInstance;
  }

  /**
   * Get piano roll container element
   */
  public getContainer(): HTMLElement | null {
    return this.pianoRollContainer;
  }

  /**
   * Check if piano roll is initialized
   */
  public isInitialized(): boolean {
    return this.pianoRollInstance !== null;
  }

  /**
   * Recreate piano roll with new configuration
   */
  public async recreate(notes: NoteData[] = []): Promise<void> {
    if (!this.pianoRollContainer) {
      throw new Error("Container not set");
    }

    // Preserve state
    const prevZoom = this.getZoom();

    // Clear container
    this.pianoRollContainer.innerHTML = "";

    // Create new container div
    const pianoRollDiv = document.createElement("div");
    pianoRollDiv.style.cssText = `
      width: 100%;
      height: ${this.config.height}px;
      border: 1px solid #ddd;
      border-radius: 8px;
      margin-bottom: 20px;
      background: #ffffff;
    `;
    this.pianoRollContainer.appendChild(pianoRollDiv);

    // Reinitialize
    await this.initialize(pianoRollDiv, notes);

    // Restore zoom
    if (prevZoom !== 1) {
      this.setZoom(prevZoom);
    }
  }

  /**
   * Destroy piano roll and cleanup
   */
  public destroy(): void {
    if (this.pianoRollInstance?.destroy) {
      this.pianoRollInstance.destroy();
    }

    this.pianoRollInstance = null;
    this.pianoRollContainer = null;
    this.currentNoteColors = [];
  }
}

/**
 * Factory function to create PianoRollManager
 */
export function createPianoRollManager(
  config?: Partial<PianoRollConfig>,
  options?: {
    enableOverlapDetection?: boolean;
    overlapColor?: number;
  }
): PianoRollManager {
  return new PianoRollManager(config, options);
}
