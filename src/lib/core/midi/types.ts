import { ParsedMidi } from "@/lib/midi/types";

/**
 * Color palette for MIDI tracks
 */
export interface ColorPalette {
  id: string;
  name: string;
  colors: number[]; // PixiJS colors (hex numbers)
}

/**
 * MIDI file entry with metadata
 */
export interface MidiFileEntry {
  id: string;
  name: string;
  fileName: string;
  parsedData: ParsedMidi | null;
  isVisible: boolean;
  isPianoRollVisible: boolean;
  fileColor: number;
  color: number; // PixiJS color
  /** Whether this file is muted (audio only, still visible in piano roll) */
  isMuted: boolean;
  /** Whether sustain pedal overlay is visible in the piano roll */
  isSustainVisible: boolean;
  /** Original file input (File or URL) for re-parsing */
  originalInput?: File | string;
  error?: string;
  /** Volume level (0-1) */
  volume?: number;
}

/**
 * Multi MIDI manager state
 */
export interface MultiMidiState {
  files: MidiFileEntry[];
  activePaletteId: string;
  customPalettes: ColorPalette[];
}
