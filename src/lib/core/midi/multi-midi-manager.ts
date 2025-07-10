import { NoteData, ParsedMidi } from "@/lib/midi/types";
import { ColorPalette, MidiFileEntry, MultiMidiState } from "./types";
import { DEFAULT_PALETTES } from "./palette";
import { createMidiFileEntry, reassignEntryColors } from "./file-entry";

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
    const entry: MidiFileEntry = createMidiFileEntry(
      fileName,
      parsedData,
      this.getNextColor(),
      displayName
    );
    this.state.files.push(entry);
    this.notifyStateChange();
    return entry.id;
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
    reassignEntryColors(this.state.files, palette);

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
