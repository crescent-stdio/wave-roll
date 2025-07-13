/**
 * MultiMidiManager - Manages multiple MIDI files with color palettes
 */

import { NoteData, ParsedMidi } from "src/lib/types";

/**
 * Color palette for MIDI tracks
 */
export interface ColorPalette {
  id: string;
  name: string;
  colors: number[]; // PixiJS colors (hex numbers)
}

/**
 * Default color palettes
 */
export const DEFAULT_PALETTES: ColorPalette[] = [
  {
    id: "vibrant",
    name: "Vibrant",
    colors: [
      0x4285f4, // Blue
      0xea4335, // Red
      0xfbbc04, // Yellow
      0x34a853, // Green
      0x9c27b0, // Purple
      0xff6f00, // Orange
      0x00bcd4, // Cyan
      0xe91e63, // Pink
    ],
  },
  {
    id: "pastel",
    name: "Pastel",
    colors: [
      0xaec6cf, // Pastel Blue
      0xffb3ba, // Pastel Red
      0xffffba, // Pastel Yellow
      0xbaffc9, // Pastel Green
      0xe0bbe4, // Pastel Purple
      0xffd8b1, // Pastel Orange
      0xb5ead7, // Pastel Mint
      0xffc0cb, // Pastel Pink
    ],
  },
  {
    id: "monochrome",
    name: "Monochrome",
    colors: [
      0x212121, // Black
      0x424242, // Dark Gray
      0x616161, // Gray
      0x757575, // Medium Gray
      0x9e9e9e, // Light Gray
      0xbdbdbd, // Lighter Gray
      0xe0e0e0, // Very Light Gray
      0xeeeeee, // Near White
    ],
  },
];

/**
 * MIDI file entry with metadata
 */
export interface MidiFileEntry {
  id: string;
  displayName: string;
  fileName: string;
  parsedData: ParsedMidi | null;
  isVisible: boolean;
  color: number; // PixiJS color
  /** Whether this file is muted (audio only, still visible in piano roll) */
  isMuted: boolean;
  error?: string;
}

/**
 * Multi MIDI manager state
 */
export interface MultiMidiState {
  files: MidiFileEntry[];
  activePaletteId: string;
  customPalettes: ColorPalette[];
}

/**
 * Manages multiple MIDI files with visualization
 */
export class MultiMidiManager {
  private state: MultiMidiState;
  private colorIndex: number = 0;
  private onStateChange?: (state: MultiMidiState) => void;

  constructor() {
    this.state = {
      files: [],
      activePaletteId: "vibrant",
      customPalettes: [],
    };
  }

  /**
   * Set state change callback
   */
  public setOnStateChange(callback: (state: MultiMidiState) => void): void {
    this.onStateChange = callback;
    // Immediately notify with current state
    this.notifyStateChange();
  }

  /**
   * Get current state
   */
  public getState(): MultiMidiState {
    return { ...this.state };
  }

  /**
   * Get active palette
   */
  private getActivePalette(): ColorPalette {
    const allPalettes = [...DEFAULT_PALETTES, ...this.state.customPalettes];
    return (
      allPalettes.find((p) => p.id === this.state.activePaletteId) ||
      DEFAULT_PALETTES[0]
    );
  }

  /**
   * Get next color from active palette
   */
  private getNextColor(): number {
    const palette = this.getActivePalette();
    const color = palette.colors[this.colorIndex % palette.colors.length];
    this.colorIndex++;
    return color;
  }

  /**
   * Add a MIDI file
   */
  public addMidiFile(
    fileName: string,
    parsedData: ParsedMidi,
    displayName?: string
  ): string {
    const id = `midi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const entry: MidiFileEntry = {
      id,
      displayName: displayName || fileName.replace(/\.mid$/i, ""),
      fileName,
      parsedData,
      isVisible: true,
      color: this.getNextColor(),
      isMuted: false,
    };

    this.state.files.push(entry);
    this.notifyStateChange();
    return id;
  }

  /**
   * Remove a MIDI file
   */
  public removeMidiFile(id: string): void {
    this.state.files = this.state.files.filter((f) => f.id !== id);
    this.notifyStateChange();
  }

  /**
   * Toggle visibility of a MIDI file
   */
  public toggleVisibility(id: string): void {
    const file = this.state.files.find((f) => f.id === id);
    if (file) {
      file.isVisible = !file.isVisible;
      this.notifyStateChange();
    }
  }

  /**
   * Toggle mute state of a MIDI file (audio only)
   */
  public toggleMute(id: string): void {
    const file = this.state.files.find((f) => f.id === id);
    if (file) {
      file.isMuted = !file.isMuted;
      this.notifyStateChange();
    }
  }

  /**
   * Update display name
   */
  public updateDisplayName(id: string, displayName: string): void {
    const file = this.state.files.find((f) => f.id === id);
    if (file) {
      file.displayName = displayName;
      this.notifyStateChange();
    }
  }

  /**
   * Update file color
   */
  public updateColor(id: string, color: number): void {
    const file = this.state.files.find((f) => f.id === id);
    if (file) {
      file.color = color;
      this.notifyStateChange();
    }
  }

  /**
   * Set active palette
   */
  public setActivePalette(paletteId: string): void {
    this.state.activePaletteId = paletteId;
    // Reset color index
    this.colorIndex = 0;

    // Reassign colors to existing files
    const palette = this.getActivePalette();
    this.state.files.forEach((file, index) => {
      file.color = palette.colors[index % palette.colors.length];
    });

    this.notifyStateChange();
  }

  /**
   * Add custom palette
   */
  public addCustomPalette(palette: ColorPalette): void {
    this.state.customPalettes.push(palette);
    this.notifyStateChange();
  }

  /**
   * Get combined notes from visible files
   */
  public getVisibleNotes(): Array<{
    note: NoteData;
    color: number;
    fileId: string;
  }> {
    const allNotes: Array<{ note: NoteData; color: number; fileId: string }> =
      [];

    this.state.files.forEach((file) => {
      if (file.isVisible && file.parsedData) {
        file.parsedData.notes.forEach((note) => {
          allNotes.push({
            note,
            color: file.color,
            fileId: file.id,
          });
        });
      }
    });

    // Sort by time
    allNotes.sort((a, b) => a.note.time - b.note.time);
    return allNotes;
  }

  /**
   * Get total duration across all visible files
   */
  public getTotalDuration(): number {
    let maxDuration = 0;
    this.state.files.forEach((file) => {
      if (file.isVisible && file.parsedData) {
        maxDuration = Math.max(maxDuration, file.parsedData.duration);
      }
    });
    return maxDuration;
  }

  /**
   * Clear all files
   */
  public clearAll(): void {
    this.state.files = [];
    this.colorIndex = 0;
    this.notifyStateChange();
  }

  /**
   * Notify state change
   */
  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }
}
