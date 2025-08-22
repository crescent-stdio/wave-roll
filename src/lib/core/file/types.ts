import { ParsedMidi } from "@/lib/midi/types";

/**
 * Interface for file loading options
 */
export interface FileLoadOptions {
  /** Optional display name for the file */
  displayName?: string;
  /** Whether to suppress batch loading optimizations */
  suppressBatchLoading?: boolean;
}

/**
 * Interface for sample file configuration
 */
export interface SampleFileConfig {
  /** Path to the MIDI file */
  path: string;
  /** Optional display name for the file */
  displayName?: string;
}

/**
 * Audio sample file configuration (wav/mp3)
 */
export interface SampleAudioFileConfig {
  /** Path to the audio file */
  path: string;
  /** Optional display name for the file */
  displayName?: string;
  /** Optional waveform color */
  color?: number;
}
/**
 * Interface for file validation result
 */
export interface FileValidationResult {
  /** Whether the file is valid */
  isValid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Parsed MIDI data if validation succeeded */
  parsedData?: ParsedMidi;
}

export interface FileInputOptions {
  multiple?: boolean;
  accept?: string;
  onFileSelect?: (files: File[]) => void;
}

export interface MidiFileItem {
  path: string;
  displayName?: string;
}

export type MidiFileItemList = Array<MidiFileItem>;
