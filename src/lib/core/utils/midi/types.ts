/**
 * Represents a tempo change event in a MIDI file
 */
export interface TempoEvent {
  /** The time in seconds when the tempo change occurs */
  time: number;
  /** The time in ticks when the tempo change occurs */
  ticks: number;
  /** The tempo in beats per minute (BPM) */
  bpm: number;
}

/**
 * Represents a time signature change event in a MIDI file
 */
export interface TimeSignatureEvent {
  /** The time in seconds when the time signature change occurs */
  time: number;
  /** The time in ticks when the time signature change occurs */
  ticks: number;
  /** The numerator of the time signature (e.g., 3 in 3/4) */
  numerator: number;
  /** The denominator of the time signature (e.g., 4 in 3/4) */
  denominator: number;
}

/**
 * Represents a musical note in the Tone.js format
 */
export interface NoteData {
  /** MIDI note number (0-127, where 60 = C4) */
  midi: number;
  /** Time in seconds from the start of the piece */
  time: number;
  /** Time in ticks from the start of the piece */
  ticks: number;
  /** Scientific pitch notation (e.g., "C4", "A#3") */
  name: string;
  /** Pitch class without octave (e.g., "C", "A#") */
  pitch: string;
  /** Octave number */
  octave: number;
  /** Note velocity (0-1, where 1 is maximum velocity) */
  velocity: number;
  /** Duration in seconds */
  duration: number;
}

/**
 * Represents metadata about a MIDI track
 */
export interface TrackData {
  /** The name of the track */
  name: string;
  /** The MIDI channel (0-15) */
  channel: number;
}

/**
 * Represents the header information of a MIDI file
 */
export interface MidiHeader {
  /** The name of the first empty track, usually the song name */
  name: string;
  /** Array of tempo changes throughout the piece */
  tempos: TempoEvent[];
  /** Array of time signature changes throughout the piece */
  timeSignatures: TimeSignatureEvent[];
  /** Pulses Per Quarter note - the timing resolution of the MIDI file */
  PPQ: number;
}

/**
 * The complete parsed MIDI file data structure
 */
export interface ParsedMidi {
  /** Header information including metadata and timing */
  header: MidiHeader;
  /** Total duration of the piece in seconds */
  duration: number;
  /** Information about the piano track */
  track: TrackData;
  /** Array of all notes in the piece */
  notes: NoteData[];
}

/**
 * Input type for MIDI file - can be either a URL string or a File object
 */
export type MidiInput = string | File;
