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
 * Instrument family categories based on GM Program Number groupings.
 * Used for UI icons and audio sampler routing.
 */
export type InstrumentFamily =
  | "piano"
  | "strings"
  | "drums"
  | "guitar"
  | "bass"
  | "synth"
  | "winds"
  | "brass"
  | "vocal"
  | "organ"
  | "mallet"
  | "others";

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
  /** The ID of the source MIDI file this note belongs to */
  fileId?: string;
  /**
   * Track ID within the MIDI file (0-based index).
   * Combined with fileId to uniquely identify the source track.
   */
  trackId?: number;
  /** Optional source index for note matching/mapping */
  sourceIndex?: number;
  /** Mark this rendered fragment as an evaluation highlight segment */
  isEvalHighlightSegment?: boolean;
  /** Highlighted segment kind for evaluation: intersection, exclusive, or ambiguous */
  evalSegmentKind?: "intersection" | "exclusive" | "ambiguous";
  /** Disable hatch/pattern overlays for a clean fill appearance */
  noOverlay?: boolean;
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
 * Extended track metadata with instrument information.
 * Used for multi-instrument MIDI files.
 */
export interface TrackInfo {
  /** Unique track ID within the MIDI file (0-based index) */
  id: number;
  /** The name of the track */
  name: string;
  /** The MIDI channel (0-15, channel 9 is typically drums) */
  channel: number;
  /** MIDI Program Number (0-127) for instrument selection */
  program?: number;
  /** Whether this track is a drum/percussion track (channel 9 or 10) */
  isDrum: boolean;
  /** Instrument family for UI icons and audio routing */
  instrumentFamily: InstrumentFamily;
  /** Number of notes in this track */
  noteCount: number;
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
  /** Information about the primary track (legacy, for backward compatibility) */
  track: TrackData;
  /** Array of all notes in the piece */
  notes: NoteData[];
  /** Control change events (e.g., sustain pedal) */
  controlChanges: ControlChangeEvent[];
  /**
   * Detailed track information for multi-instrument support.
   * Each track has its own ID, instrument family, and note count.
   */
  tracks: TrackInfo[];
}

/**
 * Input type for MIDI file - can be either a URL string or a File object
 */
export type MidiInput = string | File;

/**
 * Represents a MIDI Control Change (CC) event.
 * Currently used to capture sustain-pedal (CC 64) on/off events, but can
 * represent any controller number.
 */
export interface ControlChangeEvent {
  /** Controller number (0-127). Sustain pedal is 64. */
  controller: number;
  /** Continuous controller value (0-1 when parsed by Tone.js). */
  value: number;
  /** Absolute time in seconds when the event occurs. */
  time: number;
  /** Absolute time in ticks when the event occurs. */
  ticks: number;

  /** Optional name of the controller. */
  name?: string;
  /** The ID of the source MIDI file this control change belongs to */
  fileId?: string;
}
