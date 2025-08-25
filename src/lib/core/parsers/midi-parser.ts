import { Midi } from "@tonejs/midi";
import {
  ParsedMidi,
  MidiInput,
  NoteData,
  TrackData,
  MidiHeader,
  TempoEvent,
  TimeSignatureEvent,
  ControlChangeEvent,
} from "@/lib/midi/types";
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
 * Extracts control change events (e.g., sustain-pedal CC 64) from a Tone.js
 * MIDI track.
 */
function extractControlChanges(track: any): ControlChangeEvent[] {
  // Tone.js represents controlChanges as Record<number, ToneControlChange[]>
  const result: ControlChangeEvent[] = [];

  // Iterate through each controller number available on the track.
  for (const controllerStr of Object.keys(track.controlChanges ?? {})) {
    const controller = Number(controllerStr);
    const events = track.controlChanges[controllerStr];
    if (!Array.isArray(events)) continue;

    for (const evt of events) {
      result.push({
        controller: evt.number,
        value: evt.value, // already normalized 0-1 in Tone.js
        time: evt.time,
        ticks: evt.ticks,
        name: evt.name,
        fileId: track.name,
      });
    }
  }
  return result;
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
 * Apply sustain pedal logic to elongate notes based on CC64 events.
 * Implements channel-aware sustain handling:
 * - CC64 >= 64: sustain on
 * - note_on(vel=0) ≡ note_off
 * - Same note re-issue closes previous instance
 * - sustain_off releases all held notes
 * 
 * @param notes - Original note data
 * @param controlChanges - Control change events including CC64
 * @param channel - Channel to process
 * @returns Modified notes with sustain applied
 */
function applySustainPedal(
  notes: NoteData[],
  controlChanges: ControlChangeEvent[],
  channel: number = 0
): NoteData[] {
  // Filter CC64 events for this channel
  const sustainEvents = controlChanges
    .filter(cc => cc.controller === 64)
    .map(cc => ({
      time: cc.time,
      isOn: cc.value >= 0.5 // Tone.js normalizes to 0-1
    }));

  // Track sustain state over time
  let sustainOn = false;
  let sustainEventIdx = 0;

  // Active notes: Map<noteNumber, {onset, velocity, originalDuration}>
  const active = new Map<number, {onset: number, velocity: number, originalDuration: number}>();
  
  // Sustained notes waiting for pedal release
  const sustained = new Map<number, {onset: number, velocity: number, releaseTime: number}>();
  
  const processedNotes: NoteData[] = [];

  // Sort notes by time, then by midi number
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.midi - b.midi;
  });

  for (const note of sortedNotes) {
    const noteOn = note.time;
    const noteOff = note.time + note.duration;

    // Update sustain state at note onset
    while (sustainEventIdx < sustainEvents.length && 
           sustainEvents[sustainEventIdx].time <= noteOn) {
      const event = sustainEvents[sustainEventIdx];
      
      if (sustainOn && !event.isOn) {
        // Pedal released: close all sustained notes
        for (const [midi, data] of sustained) {
          const elongatedNote = notes.find(n => 
            n.midi === midi && 
            Math.abs(n.time - data.onset) < 0.001
          );
          
          if (elongatedNote) {
            processedNotes.push({
              ...elongatedNote,
              duration: event.time - data.onset
            });
          }
        }
        sustained.clear();
      }
      
      sustainOn = event.isOn;
      sustainEventIdx++;
    }

    // Check if same note is already active or sustained
    if (active.has(note.midi)) {
      // Close previous instance at current onset
      const prev = active.get(note.midi)!;
      processedNotes.push({
        ...note,
        midi: note.midi,
        time: prev.onset,
        duration: noteOn - prev.onset,
        velocity: prev.velocity
      });
      active.delete(note.midi);
    } else if (sustained.has(note.midi)) {
      // Close sustained instance
      const prev = sustained.get(note.midi)!;
      const originalNote = notes.find(n => 
        n.midi === note.midi && 
        Math.abs(n.time - prev.onset) < 0.001
      );
      
      if (originalNote) {
        processedNotes.push({
          ...originalNote,
          duration: noteOn - prev.onset
        });
      }
      sustained.delete(note.midi);
    }

    // Start new note
    active.set(note.midi, {
      onset: noteOn,
      velocity: note.velocity,
      originalDuration: note.duration
    });

    // Process note release
    // Find sustain state at note-off time
    let sustainAtRelease = sustainOn;
    let tempIdx = sustainEventIdx;
    
    while (tempIdx < sustainEvents.length && 
           sustainEvents[tempIdx].time <= noteOff) {
      sustainAtRelease = sustainEvents[tempIdx].isOn;
      tempIdx++;
    }

    if (sustainAtRelease) {
      // Move to sustained pool
      sustained.set(note.midi, {
        onset: noteOn,
        velocity: note.velocity,
        releaseTime: noteOff
      });
      active.delete(note.midi);
    } else {
      // Normal release
      processedNotes.push(note);
      active.delete(note.midi);
    }
  }

  // Handle remaining sustained notes at end of file
  const finalTime = Math.max(
    ...notes.map(n => n.time + n.duration),
    ...(sustainEvents.length > 0 ? [sustainEvents[sustainEvents.length - 1].time] : [0])
  );

  for (const [midi, data] of sustained) {
    const originalNote = notes.find(n => 
      n.midi === midi && 
      Math.abs(n.time - data.onset) < 0.001
    );
    
    if (originalNote) {
      processedNotes.push({
        ...originalNote,
        duration: finalTime - data.onset
      });
    }
  }

  // Handle remaining active notes
  for (const [midi, data] of active) {
    const originalNote = notes.find(n => 
      n.midi === midi && 
      Math.abs(n.time - data.onset) < 0.001
    );
    
    if (originalNote) {
      processedNotes.push({
        ...originalNote,
        duration: finalTime - data.onset
      });
    }
  }

  return processedNotes.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    return a.midi - b.midi;
  });
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
export async function parseMidi(
  input: MidiInput,
  options: { applyPedalElongate?: boolean } = {}
): Promise<ParsedMidi> {
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
    let notes: NoteData[] = pianoTrack.notes.map(convertNote);

    // Step 7: Extract control-change events (e.g., sustain pedal)
    const pianoChannel = pianoTrack.channel ?? 0;

    const controlChanges: ControlChangeEvent[] = midi.tracks
      // Keep CC events that share the same channel as the piano track.
      .filter((trk) => trk.channel === pianoChannel)
      .flatMap((trk) => extractControlChanges(trk))
      // Sort chronologically for convenience.
      .sort((a, b) => a.time - b.time);

    // Step 8: Apply sustain pedal if requested
    if (options.applyPedalElongate && controlChanges.length > 0) {
      const sustainEvents = controlChanges.filter(cc => cc.controller === 64);
      if (sustainEvents.length > 0) {
        notes = applySustainPedal(notes, controlChanges, pianoChannel);
      }
    }

    // Step 9: Calculate total duration
    const duration = midi.duration;

    return {
      header,
      duration,
      track,
      notes,
      controlChanges, // include CC events
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse MIDI file: ${error.message}`);
    }
    throw new Error("Failed to parse MIDI file: Unknown error");
  }
}
