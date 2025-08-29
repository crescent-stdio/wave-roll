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
 * Implements threshold-based sustain handling:
 * - CC64 >= threshold: sustain on
 * - Sustain remains on until CC64 < threshold
 * - Same note re-issue closes previous instance
 * - sustain_off releases all held notes
 * 
 * @param notes - Original note data
 * @param controlChanges - Control change events including CC64
 * @param threshold - Pedal threshold (0-127, default 64)
 * @param channel - Channel to process
 * @returns Modified notes with sustain applied
 */
function applySustainPedal(
  notes: NoteData[],
  controlChanges: ControlChangeEvent[],
  threshold: number = 64,
  channel: number = 0
): NoteData[] {
  // If no notes, return empty
  if (notes.length === 0) return [];
  
  // Convert threshold to normalized value (Tone.js uses 0-1)
  const normalizedThreshold = threshold / 127;
  
  // Create note on/off events
  interface NoteEvent {
    time: number;
    type: 'on' | 'off';
    midi: number;
    velocity: number;
    noteIndex: number;
  }
  
  const noteEvents: NoteEvent[] = [];
  notes.forEach((note, idx) => {
    noteEvents.push({
      time: note.time,
      type: 'on',
      midi: note.midi,
      velocity: note.velocity,
      noteIndex: idx
    });
    noteEvents.push({
      time: note.time + note.duration,
      type: 'off',
      midi: note.midi,
      velocity: note.velocity,
      noteIndex: idx
    });
  });
  
  // Sort events by time
  noteEvents.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    // Process note-offs before note-ons at the same time
    if (a.type !== b.type) return a.type === 'off' ? -1 : 1;
    return a.midi - b.midi;
  });
  
  // Filter CC64 events
  const sustainEvents = controlChanges
    .filter(cc => cc.controller === 64)
    .map(cc => ({
      time: cc.time,
      value: cc.value,
      isOn: cc.value >= normalizedThreshold
    }))
    .sort((a, b) => a.time - b.time);

  // Process events
  let sustainOn = false;
  let sustainIdx = 0;
  
  // Active notes: Map<noteIndex, {onset, midi, velocity}>
  const active = new Map<number, {onset: number; midi: number; velocity: number}>();
  
  // Sustained notes: Map<midi, {onset, velocity, noteIndex}>
  const sustained = new Map<number, {onset: number; velocity: number; noteIndex: number}>();
  
  // Result notes with modified durations
  const noteResults = new Map<number, NoteData>();
  
  for (const event of noteEvents) {
    // Update sustain state up to this event time
    while (sustainIdx < sustainEvents.length && sustainEvents[sustainIdx].time <= event.time) {
      const wasOn = sustainOn;
      sustainOn = sustainEvents[sustainIdx].isOn;
      
      // When pedal released, end all sustained notes
      if (wasOn && !sustainOn) {
        const releaseTime = sustainEvents[sustainIdx].time;
        for (const [midi, data] of sustained) {
          const originalNote = notes[data.noteIndex];
          noteResults.set(data.noteIndex, {
            ...originalNote,
            duration: releaseTime - data.onset
          });
        }
        sustained.clear();
      }
      sustainIdx++;
    }
    
    if (event.type === 'on') {
      // Note on
      // Check if same note is already sustained
      if (sustained.has(event.midi)) {
        const prev = sustained.get(event.midi)!;
        const originalNote = notes[prev.noteIndex];
        noteResults.set(prev.noteIndex, {
          ...originalNote,
          duration: event.time - prev.onset
        });
        sustained.delete(event.midi);
      }
      
      // Start new note
      active.set(event.noteIndex, {
        onset: event.time,
        midi: event.midi,
        velocity: event.velocity
      });
      
    } else {
      // Note off
      if (active.has(event.noteIndex)) {
        const noteData = active.get(event.noteIndex)!;
        active.delete(event.noteIndex);
        
        if (sustainOn) {
          // Move to sustained
          sustained.set(noteData.midi, {
            onset: noteData.onset,
            velocity: noteData.velocity,
            noteIndex: event.noteIndex
          });
        } else {
          // Normal release - use original duration
          if (!noteResults.has(event.noteIndex)) {
            noteResults.set(event.noteIndex, notes[event.noteIndex]);
          }
        }
      }
    }
  }
  
  // Find the final time
  let finalTime = Math.max(...notes.map(n => n.time + n.duration));
  
  // Handle remaining sustained notes at end of file
  for (const [midi, data] of sustained) {
    const originalNote = notes[data.noteIndex];
    noteResults.set(data.noteIndex, {
      ...originalNote,
      duration: finalTime - data.onset
    });
  }
  
  // Handle remaining active notes (shouldn't happen but safety check)
  for (const [noteIdx, data] of active) {
    if (!noteResults.has(noteIdx)) {
      noteResults.set(noteIdx, notes[noteIdx]);
    }
  }
  
  // Build final result array
  const result: NoteData[] = [];
  for (let i = 0; i < notes.length; i++) {
    if (noteResults.has(i)) {
      result.push(noteResults.get(i)!);
    } else {
      // If note wasn't processed, include original
      result.push(notes[i]);
    }
  }
  
  return result.sort((a, b) => {
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
  options: { applyPedalElongate?: boolean; pedalThreshold?: number } = {}
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

  // Step 4: Collect ALL tracks that contain notes and merge them for evaluation.
  const noteTracks = midi.tracks.filter((t: any) => t.notes && t.notes.length > 0);
  if (noteTracks.length === 0) {
    throw new Error("No tracks with notes found in MIDI file");
  }

  // Step 5: Extract track metadata (use the first track name/channel for compatibility)
  const primaryTrack = noteTracks[0];
  const track = extractTrackMetadata(primaryTrack, 0);

  // Step 6: Convert notes to our format (per-track), applying sustain per channel when enabled
  const applyPedal = options.applyPedalElongate !== false; // default ON
  const threshold = options.pedalThreshold ?? 64;
  const mergedNotes: NoteData[] = [];
  for (const t of noteTracks) {
    const channel = t.channel ?? 0;
    let trackNotes: NoteData[] = t.notes.map(convertNote);
    if (applyPedal) {
      // Extract CC exclusively from this track (channel)
      const cc = extractControlChanges(t);
      if (cc.some((e) => e.controller === 64)) {
        trackNotes = applySustainPedal(trackNotes, cc, threshold, channel);
      }
    }
    mergedNotes.push(...trackNotes);
  }

  // Merge and sort
  let notes: NoteData[] = mergedNotes.sort((a, b) =>
    a.time !== b.time ? a.time - b.time : a.midi - b.midi
  );

  // Collect merged control changes across all note tracks for UI/diagnostics
  const ccMerged: ControlChangeEvent[] = [];
  for (const t of noteTracks) {
    const channel = t.channel ?? 0;
    const cc = extractControlChanges(t).map((evt) => ({ ...evt, fileId: primaryTrack.name }));
    ccMerged.push(...cc);
  }

    // Step 9: Calculate total duration
    const duration = midi.duration;

    return {
      header,
      duration,
      track,
      notes,
      controlChanges: ccMerged, // merged CC events from all note tracks
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse MIDI file: ${error.message}`);
    }
    throw new Error("Failed to parse MIDI file: Unknown error");
  }
}
