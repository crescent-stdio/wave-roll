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
import { applySustainPedalElongation } from "@/lib/core/parsers/midi-parser-enhanced";
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
/**
 * Apply sustain pedal elongation per channel.
 * 
 * Based on implementation from onsets-and-frames:
 * https://github.com/jongwook/onsets-and-frames/blob/master/onsets_and_frames/midi.py
 * 
 * Key behaviors:
 * - Sustain pedal (CC64 >= threshold) keeps notes sounding after note-off
 * - Re-striking same pitch cuts previous sustained instance (FIFO)
 * - Sustain release (CC64 < threshold) releases all held notes
 * - Proper event ordering ensures correct temporal processing
 * 
 * Adaptations for this project:
 * - TypeScript implementation with Tone.js data structures
 * - Normalized CC values (0-1) instead of MIDI (0-127)
 * - Enhanced event sorting for simultaneous events
 * - Support for per-pitch note stacks
 */
function applySustainPedal(
  notes: NoteData[],
  controlChanges: ControlChangeEvent[],
  threshold: number = 64,
  channel: number = 0
): NoteData[] {
  if (notes.length === 0) return [];

  const EPS = 1e-9;
  const normalizedThreshold = threshold / 127;

  type NoteEvent = {
    time: number;
    type: 'on' | 'off';
    midi: number;
    velocity: number;
    noteIndex: number;
  };

  const events: NoteEvent[] = [];
  notes.forEach((n, idx) => {
    events.push({ time: n.time, type: 'on', midi: n.midi, velocity: n.velocity, noteIndex: idx });
    events.push({ time: n.time + n.duration, type: 'off', midi: n.midi, velocity: n.velocity, noteIndex: idx });
  });

  // Sort notes: by time, then 'off' before 'on' at same time, then pitch
  events.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.type !== b.type) return a.type === 'off' ? -1 : 1;
    return a.midi - b.midi;
  });

  // Sustain events (CC64)
  const sustain = controlChanges
    .filter((cc) => cc.controller === 64)
    .map((cc) => ({ time: cc.time, isOn: (cc.value ?? 0) >= normalizedThreshold }))
    .sort((a, b) => a.time - b.time);

  let sustainOn = false;
  let si = 0;

  // Active notes indexed by noteIndex
  const active = new Map<number, { onset: number; midi: number; velocity: number }>();
  // Sustained notes per pitch (stack to support rare overlapping same-pitch cases)
  const sustained = new Map<number, Array<{ onset: number; velocity: number; noteIndex: number }>>();

  // Final results by original index
  const results = new Map<number, NoteData>();

  const releaseAll = (t: number) => {
    sustained.forEach((arr) => {
      for (const data of arr) {
        const orig = notes[data.noteIndex];
        const dur = Math.max(EPS, t - data.onset);
        results.set(data.noteIndex, { ...orig, duration: dur });
      }
    });
    sustained.clear();
  };

  for (const ev of events) {
    // Apply any sustain state changes up to and including this event time
    while (si < sustain.length && sustain[si].time <= ev.time + EPS) {
      const prev = sustainOn;
      sustainOn = sustain[si].isOn;
      if (prev && !sustainOn) {
        releaseAll(sustain[si].time);
      }
      si += 1;
    }

    if (ev.type === 'on') {
      // If there is a sustained note of the same pitch, cut the earliest one
      const stack = sustained.get(ev.midi);
      if (stack && stack.length > 0) {
        const prevData = stack.shift()!; // earliest sustained
        const orig = notes[prevData.noteIndex];
        const dur = Math.max(EPS, ev.time - prevData.onset);
        results.set(prevData.noteIndex, { ...orig, duration: dur });
        if (stack.length === 0) sustained.delete(ev.midi);
      }
      // Mark this note as active
      active.set(ev.noteIndex, { onset: ev.time, midi: ev.midi, velocity: ev.velocity });
    } else {
      // Note off
      if (!active.has(ev.noteIndex)) continue; // safety
      const data = active.get(ev.noteIndex)!;
      active.delete(ev.noteIndex);
      if (sustainOn) {
        // Move to sustained stack for this pitch
        const stack = sustained.get(data.midi) ?? [];
        stack.push({ onset: data.onset, velocity: data.velocity, noteIndex: ev.noteIndex });
        sustained.set(data.midi, stack);
      } else {
        // Finalize with original duration (no elongation)
        if (!results.has(ev.noteIndex)) {
          results.set(ev.noteIndex, notes[ev.noteIndex]);
        }
      }
    }
  }

  // Determine file end and release any remaining sustained notes at the end
  const finalTime = Math.max(...notes.map((n) => n.time + n.duration));
  releaseAll(finalTime);

  // Any remaining active notes (should not happen) - keep original
  for (const [idx] of active) {
    if (!results.has(idx)) results.set(idx, notes[idx]);
  }

  // Build ordered array
  const out: NoteData[] = [];
  for (let i = 0; i < notes.length; i++) {
    out.push(results.get(i) ?? notes[i]);
  }
  out.sort((a, b) => (a.time !== b.time ? a.time - b.time : a.midi - b.midi));
  return out;
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
        // Use the enhanced sustain-pedal elongation which follows
        // onsets-and-frames ordering (sustain_off > note_off > sustain_on > note_on)
        trackNotes = applySustainPedalElongation(trackNotes, cc, threshold, channel);
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
