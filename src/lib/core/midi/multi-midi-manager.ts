import { NoteData, ParsedMidi } from "@/lib/midi/types";
import { ColorPalette, MidiFileEntry, MultiMidiState } from "./types";
import { DEFAULT_PALETTES } from "./palette";
import { createMidiFileEntry, reassignEntryColors } from "./file-entry";
import { parseMidi } from "@/lib/core/parsers/midi-parser";

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
        // Ignore malformed JSON - fall back to defaults.
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
    const colors = palette.colors;
    const color =
      colors.length > 0
        ? colors[this.colorIndex % colors.length]
        : 0x666666;
    this.colorIndex++;
    return color;
  }

  /**
   * Reset color index to match current file count
   */
  private resetColorIndex(): void {
    this.colorIndex = this.state.files.length;
  }

  /**
   * Add a MIDI file
   */
  public addMidiFile(
    fileName: string,
    parsedData: ParsedMidi,
    displayName?: string,
    originalInput?: File | string
  ): string {
    const entry: MidiFileEntry = createMidiFileEntry(
      fileName,
      parsedData,
      this.getNextColor(),
      displayName,
      originalInput || fileName
    );
    this.state.files.push(entry);
    try {
      // Set baseline/original tempo from MIDI header's first/initial tempo
      const tempos = parsedData.header?.tempos || [];
      const EPS = 1e-3;
      const atZero = tempos.filter((t) => Math.abs(t.time || 0) <= EPS);
      const first = (atZero.length > 0 ? atZero : tempos).sort((a, b) => (a.time || 0) - (b.time || 0))[0];
      const bpm0 = Math.max(20, Math.min(300, first?.bpm || 120));
      // Push into visualization engine (core playback engine)
      const viz = (window as unknown as { _waveRollViz?: { setTempo?: (n: number) => void; setOriginalTempo?: (n: number) => void } })._waveRollViz;
      if (viz?.setOriginalTempo && viz?.setTempo) {
        viz.setOriginalTempo(bpm0);
        viz.setTempo(bpm0);
      }
    } catch {}
    this.notifyStateChange();
    return entry.id;
  }

  /**
   * Remove a MIDI file
   */
  public removeMidiFile(id: string): void {
    this.state.files = this.state.files.filter((f) => f.id !== id);
    this.resetColorIndex();
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

    // After re-assigning, move the index forward so that the next added file
    // continues from the subsequent colour instead of restarting at 0.
    this.resetColorIndex();

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
      // Reset index *before* reassigning so that colours align starting at 0,
      // then advance to the current file count to avoid duplicates afterwards.
      this.colorIndex = 0;
      reassignEntryColors(this.state.files, this.state.customPalettes[idx]);
      this.resetColorIndex();
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
    this.resetColorIndex();
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

  /**
   * Toggle sustain overlay visibility of a MIDI file (visualisation only)
   */
  public toggleSustainVisibility(id: string): void {
    const file = this.state.files.find((f) => f.id === id);
    if (file) {
      // Default to true when undefined for backward compatibility
      file.isSustainVisible = !(file.isSustainVisible ?? true);
      this.notifyStateChange();
    }
  }

  /**
   * Reparse all MIDI files with new settings (e.g., pedal elongate)
   */
  public async reparseAllFiles(
    options: { applyPedalElongate?: boolean; pedalThreshold?: number } = {},
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    const total = this.state.files.length;
    let current = 0;

    for (const file of this.state.files) {
      if (file.originalInput && file.parsedData) {
        try {
          // Reparse the MIDI file with new options
          const reparsedData = await parseMidi(file.originalInput, options);
          file.parsedData = reparsedData;
          
          current++;
          if (onProgress) {
            onProgress(current, total);
          }
        } catch (error) {
          console.error(`Failed to reparse ${file.fileName}:`, error);
          file.error = `Failed to reparse: ${error}`;
        }
      }
    }

    // Notify state change after all files are reparsed
    this.notifyStateChange();
  }
}
