import { ParsedMidi } from "@/lib/midi/types";

/**
 * Interface for file loading options
 */
export interface FileLoadOptions {
  /** Optional name for the file */
  name?: string;
  /** Whether to suppress batch loading optimizations */
  suppressBatchLoading?: boolean;
}

/**
 * Interface for sample file configuration
 */
export interface SampleFileConfig {
  /** Path to the MIDI file */
  path: string;
  /** Optional name for the file */
  name?: string;
  /** Optional file type (defaults to "midi") */
  type?: "midi" | "audio";
}

/**
 * Audio sample file configuration (wav/mp3)
 */
export interface SampleAudioFileConfig {
  /** Path to the audio file */
  path: string;
  /** Optional name for the file */
  name?: string;
  /** Optional waveform color */
  color?: number;
  /** Optional file type (defaults to "audio") */
  type?: "midi" | "audio";
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
  /** Optional name for the file */
  name?: string;
  type?: "midi" | "audio";
}

export type MidiFileItemList = Array<MidiFileItem>;
