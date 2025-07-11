import { Midi } from "@tonejs/midi";
import {
  ParsedMidi,
  MidiInput,
  NoteData,
  TrackData,
  MidiHeader,
  TempoEvent,
  TimeSignatureEvent,
} from "@/lib/types";
import {
  midiToNoteName,
  midiToPitchClass,
  midiToOctave,
} from "@/lib/core/utils/midi";

/**
 * Loads MIDI data from a URL by fetching the file
 * @param url - The URL to fetch the MIDI file from
 * @returns Promise that resolves to an ArrayBuffer containing the MIDI data
 * @throws Error if the fetch request fails or the response is not ok
 */
async function loadMidiFromUrl(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch MIDI file from URL: ${response.status} ${response.statusText}`
    );
  }
  return response.arrayBuffer();
}

/**
 * Loads MIDI data from a File object
 * @param file - The File object containing the MIDI data
 * @returns Promise that resolves to an ArrayBuffer containing the MIDI data
 */
async function loadMidiFromFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as ArrayBuffer"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Extracts track metadata from a Tone.js MIDI track
 * @param track - The Tone.js MIDI track object
 * @param index - The index of the track (used for default naming)
 * @returns TrackData object with name and channel information
 */
function extractTrackMetadata(track: any, index: number): TrackData {
  const name = track.name || "Piano";
  const channel = track.channel || 0;
  return { name, channel };
}

/**
 * Extracts header information from a Tone.js MIDI object
 * @param midi - The parsed Tone.js MIDI object
 * @returns MidiHeader object with metadata and timing information
 */
function extractMidiHeader(midi: any): MidiHeader {
  // Extract song name from the first track with a name, or use a default
  let name = "Untitled";
  for (const track of midi.tracks) {
    if (track.name) {
      name = track.name;
      break;
    }
  }

  // Extract tempo events
  const tempos: TempoEvent[] = midi.header.tempos.map((tempo: any) => ({
    time: tempo.time,
    ticks: tempo.ticks,
    bpm: tempo.bpm,
  }));

  // Extract time signature events
  const timeSignatures: TimeSignatureEvent[] = midi.header.timeSignatures.map(
    (ts: any) => ({
      time: ts.time,
      ticks: ts.ticks,
      numerator: ts.numerator,
      denominator: ts.denominator,
    })
  );

  return {
    name,
    tempos,
    timeSignatures,
    PPQ: midi.header.ppq,
  };
}

/**
 * Converts Tone.js note data to our NoteData format
 * @param note - The Tone.js note object
 * @returns NoteData object in the specified format
 */
function convertNote(note: any): NoteData {
  return {
    midi: note.midi,
    time: note.time,
    ticks: note.ticks,
    name: midiToNoteName(note.midi),
    pitch: midiToPitchClass(note.midi),
    octave: midiToOctave(note.midi),
    velocity: note.velocity,
    duration: note.duration,
  };
}

/**
 * Parses a MIDI file and extracts musical data in the Tone.js format
 *
 * This function can load MIDI files from either a URL or a File object,
 * then parses them using the @tonejs/midi library. It focuses on the first
 * piano track and extracts notes, timing, and metadata.
 *
 * @param input - Either a URL string or a File object containing the MIDI data
 * @returns Promise that resolves to a ParsedMidi object containing all extracted data
 * @throws Error if the MIDI file cannot be loaded or parsed
 *
 * @example
 * ```typescript
 * // Load from URL
 * const midiData = await parseMidi('https://example.com/song.mid');
 *
 * // Load from File object (e.g., from file input)
 * const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
 * const file = fileInput.files[0];
 * const midiData = await parseMidi(file);
 *
 * // console.log(`Song: ${midiData.header.name}`);
 * // console.log(`Duration: ${midiData.duration} seconds`);
 * // console.log(`Notes: ${midiData.notes.length}`);
 * ```
 */
export async function parseMidi(input: MidiInput): Promise<ParsedMidi> {
  try {
    // Step 1: Load MIDI data based on input type
    let arrayBuffer: ArrayBuffer;
    if (typeof input === "string") {
      arrayBuffer = await loadMidiFromUrl(input);
    } else {
      arrayBuffer = await loadMidiFromFile(input);
    }

    // Step 2: Parse MIDI data with Tone.js
    const midi = new Midi(arrayBuffer);

    // Step 3: Extract header information
    const header = extractMidiHeader(midi);

    // Step 4: Find the first track with notes (assuming it's the piano track)
    const pianoTrack = midi.tracks.find(
      (track) => track.notes && track.notes.length > 0
    );
    if (!pianoTrack) {
      throw new Error("No tracks with notes found in MIDI file");
    }

    // Step 5: Extract track metadata
    const track = extractTrackMetadata(pianoTrack, 0);

    // Step 6: Convert notes to our format
    const notes: NoteData[] = pianoTrack.notes.map(convertNote);

    // Step 7: Calculate total duration
    const duration = midi.duration;

    return {
      header,
      duration,
      track,
      notes,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse MIDI file: ${error.message}`);
    }
    throw new Error("Failed to parse MIDI file: Unknown error");
  }
}
