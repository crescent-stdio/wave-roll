import { NoteData, ParsedMidi } from "@/lib/midi/types";
import { ColorPalette, MidiFileEntry, MultiMidiState } from "./types";
import { DEFAULT_PALETTES } from "./palette";
import { createMidiFileEntry, reassignEntryColors } from "./file-entry";

const PALETTE_STORAGE_KEY = "waveRoll.paletteState";

/**
 * Manages multiple MIDI files with visualization
 */
export class MultiMidiManager {
  private state: MultiMidiState;
  private colorIndex: number = 0;
  private onStateChange?: (state: MultiMidiState) => void;
  /** Multiple subscribers for UI components */
  private listeners: Array<(state: MultiMidiState) => void> = [];

  constructor() {
    // Attempt to restore palette preferences from localStorage so that
    // the UI remembers the user’s selection across sessions.
    let stored: Partial<
      Pick<MultiMidiState, "activePaletteId" | "customPalettes">
    > | null = null;
    if (typeof window !== "undefined" && "localStorage" in window) {
      try {
        stored = JSON.parse(
          window.localStorage.getItem(PALETTE_STORAGE_KEY) || "null"
        );
      } catch {
        // Ignore malformed JSON – fall back to defaults.
      }
    }

    this.state = {
      files: [],
      activePaletteId: stored?.activePaletteId ?? "vibrant",
      customPalettes: stored?.customPalettes ?? [],
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
   * Subscribe to state changes. Returns an unsubscribe function.
   */
  public subscribe(cb: (state: MultiMidiState) => void): () => void {
    this.listeners.push(cb);
    // Emit current state immediately
    cb(this.getState());
    return () => {
      this.listeners = this.listeners.filter((fn) => fn !== cb);
    };
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
      // Keep both visibility flags in sync so that UI and core logic
      // referring to either property behave consistently. Historically
      // the codebase used both `isVisible` (legacy UI components) and
      // `isPianoRollVisible` (core engine). A desynchronised state meant
      // that toggling visibility in the UI had no effect on rendering or
      // audio. We therefore flip **both** properties together.

      const newVisibility = !file.isPianoRollVisible;
      file.isPianoRollVisible = newVisibility;
      file.isVisible = newVisibility;
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
   * Reorder files within the state array.
   * @param sourceIndex - The current index of the file.
   * @param targetIndex - The desired index after the move.
   */
  public reorderFiles(sourceIndex: number, targetIndex: number): void {
    const { files } = this.state;
    if (
      sourceIndex === targetIndex ||
      sourceIndex < 0 ||
      targetIndex < 0 ||
      sourceIndex >= files.length ||
      targetIndex >= files.length
    ) {
      return;
    }
    const [moved] = files.splice(sourceIndex, 1);
    files.splice(targetIndex, 0, moved);
    this.notifyStateChange();
  }

  /**
   * Set active palette
   */
  public setActivePalette(paletteId: string): void {
    // Do nothing if the palette is already active to avoid resetting colors
    if (this.state.activePaletteId === paletteId) return;

    this.state.activePaletteId = paletteId;
    // Reset color index so that subsequent files start from the first color
    this.colorIndex = 0;

    // Reassign colors to existing files so that they follow the newly selected palette
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
   * Update an existing custom palette. Only applicable to user-defined palettes.
   * If the palette is currently active, note that colors of existing files will be reassigned.
   * @param id     Palette identifier
   * @param patch  Partial properties to update (name and/or colors)
   */
  public updateCustomPalette(
    id: string,
    patch: Partial<Omit<ColorPalette, "id">>
  ): void {
    const idx = this.state.customPalettes.findIndex((p) => p.id === id);
    if (idx === -1) return;

    this.state.customPalettes[idx] = {
      ...this.state.customPalettes[idx],
      ...patch,
      id, // Ensure id stays unchanged
    } as ColorPalette;

    // If the updated palette is the active one, reassign colors
    if (this.state.activePaletteId === id) {
      this.colorIndex = 0;
      reassignEntryColors(this.state.files, this.state.customPalettes[idx]);
    }

    this.notifyStateChange();
  }

  /**
   * Remove a user-defined custom palette.
   * If the palette is active, fall back to another palette and reassign colors.
   */
  public removeCustomPalette(id: string): void {
    const idx = this.state.customPalettes.findIndex((p) => p.id === id);
    if (idx === -1) return;

    // Remove palette from state
    this.state.customPalettes.splice(idx, 1);

    // If the removed palette was active, select a fallback palette
    if (this.state.activePaletteId === id) {
      this.state.activePaletteId =
        this.state.customPalettes[0]?.id ?? DEFAULT_PALETTES[0].id;
      // Reset color assignment so existing files use the new palette
      this.colorIndex = 0;
      reassignEntryColors(this.state.files, this.getActivePalette());
    }

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
      if (file.isPianoRollVisible && file.parsedData) {
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
      if (file.isPianoRollVisible && file.parsedData) {
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
    this.listeners.forEach((l) => l(this.getState()));

    // Persist palette-related state so that it survives reloads.
    if (typeof window !== "undefined" && "localStorage" in window) {
      try {
        const payload = {
          activePaletteId: this.state.activePaletteId,
          customPalettes: this.state.customPalettes,
        };
        window.localStorage.setItem(
          PALETTE_STORAGE_KEY,
          JSON.stringify(payload)
        );
      } catch {
        // Silently ignore storage quota / access errors.
      }
    }
  }
}
