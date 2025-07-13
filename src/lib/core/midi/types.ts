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
