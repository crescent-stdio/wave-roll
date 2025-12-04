import { Midi } from "@tonejs/midi";
import {
  ParsedMidi,
  MidiInput,
  NoteData,
  TrackData,
  TrackInfo,
  MidiHeader,
  TempoEvent,
  TimeSignatureEvent,
  ControlChangeEvent,
  InstrumentFamily,
} from "@/lib/midi/types";
// Sustain-pedal elongation utilities (ported from onsets-and-frames)

// Local analysis types
export interface SustainRegion {
  start: number;
  end: number;
  duration: number;
}
import {
  midiToNoteName,
  midiToPitchClass,
  midiToOctave,
} from "@/lib/core/utils/midi";
import { getGMInstrumentDisplayName } from "@/lib/core/audio/gm-instruments";

/**
 * GM Program Number to Instrument Family mapping.
 * Based on General MIDI Level 1 specification.
 * Reference: https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/names.json
 */
export function getInstrumentFamily(
  program: number,
  channel: number
): InstrumentFamily {
  // Channel 9 (0-indexed) or Channel 10 (1-indexed) is always drums in GM
  if (channel === 9 || channel === 10) {
    return "drums";
  }

  // GM Program Number ranges (0-127)
  if (program >= 0 && program <= 7) return "piano"; // 0-7: Piano
  if (program >= 8 && program <= 15) return "mallet"; // 8-15: Chromatic Percussion (mallet instruments)
  if (program >= 16 && program <= 23) return "organ"; // 16-23: Organ, Accordion, Harmonica
  if (program >= 24 && program <= 31) return "guitar"; // 24-31: Guitar
  if (program >= 32 && program <= 39) return "bass"; // 32-39: Bass
  if (program >= 40 && program <= 51) return "strings"; // 40-51: Strings (Violin, Viola, Cello, etc.)
  if (program >= 52 && program <= 54) return "vocal"; // 52-54: Choir/Voice (choir_aahs, voice_oohs, synth_choir)
  if (program === 55) return "strings"; // 55: Orchestra Hit (keep with strings/ensemble)
  if (program >= 56 && program <= 63) return "brass"; // 56-63: Brass
  if (program >= 64 && program <= 79) return "winds"; // 64-79: Reed & Pipe
  if (program >= 80 && program <= 103) return "synth"; // 80-103: Synth Lead, Pad, FX
  if (program >= 104 && program <= 111) return "others"; // 104-111: Ethnic
  if (program >= 112 && program <= 119) return "drums"; // 112-119: Percussive
  if (program >= 120 && program <= 127) return "others"; // 120-127: Sound Effects

  return "others";
}

/**
 * Get a human-readable default name for an instrument family.
 */
export function getInstrumentFamilyName(family: InstrumentFamily): string {
  const names: Record<InstrumentFamily, string> = {
    piano: "Piano",
    strings: "Strings",
    drums: "Drums",
    guitar: "Guitar",
    bass: "Bass",
    synth: "Synth",
    winds: "Winds",
    brass: "Brass",
    vocal: "Vocal",
    organ: "Organ",
    mallet: "Mallet",
    others: "Other",
  };
  return names[family] ?? "Other";
}

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
  // Round BPM to integer to avoid floating-point precision issues
  // (MIDI stores tempo as microseconds per beat, causing slight errors on conversion)
  const tempos: TempoEvent[] = midi.header.tempos.map((tempo: any) => ({
    time: tempo.time,
    ticks: tempo.ticks,
    bpm: Math.round(tempo.bpm),
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
 * @param trackId - Optional track ID to associate with this note
 * @returns NoteData object in the specified format
 */
function convertNote(note: any, trackId?: number): NoteData {
  return {
    midi: note.midi,
    time: note.time,
    ticks: note.ticks,
    name: midiToNoteName(note.midi),
    pitch: midiToPitchClass(note.midi),
    octave: midiToOctave(note.midi),
    velocity: note.velocity,
    duration: note.duration,
    trackId,
  };
}

/**
 * Apply sustain pedal elongation to MIDI notes.
 *
 * Algorithm (based on onsets-and-frames):
 * 1) When sustain pedal is pressed (CC64 >= threshold), notes continue sounding after note-off
 * 2) Notes are released when sustain pedal is released (CC64 < threshold) or when the same pitch is re-played
 * 3) Handles multiple simultaneous notes of the same pitch via stacking (FIFO)
 */
export function applySustainPedalElongation(
  notes: NoteData[],
  controlChanges: ControlChangeEvent[],
  threshold: number = 64,
  channel: number = 0
): NoteData[] {
  if (notes.length === 0) return [];

  const EPS = 1e-9;
  const normalizedThreshold = threshold / 127; // MIDI (0-127) -> normalized (0-1)

  type Event = {
    time: number;
    type: "note_on" | "note_off" | "sustain_on" | "sustain_off";
    index: number; // original note index for note events
    midi?: number;
    velocity?: number;
  };

  const events: Event[] = [];

  // Note on/off events
  notes.forEach((note, index) => {
    events.push({
      time: note.time,
      type: "note_on",
      index,
      midi: note.midi,
      velocity: note.velocity,
    });
    events.push({
      time: note.time + note.duration,
      type: "note_off",
      index,
      midi: note.midi,
      velocity: note.velocity,
    });
  });

  // Sustain events (CC64), only add on state changes
  let prevSustain = false;
  controlChanges
    .filter((cc) => cc.controller === 64)
    .forEach((cc) => {
      const isOn = (cc.value ?? 0) >= normalizedThreshold;
      if (isOn !== prevSustain) {
        events.push({
          time: cc.time,
          type: isOn ? "sustain_on" : "sustain_off",
          index: -1,
        });
        prevSustain = isOn;
      }
    });

  // Sort events. Priority for ties: sustain_off > note_off > sustain_on > note_on
  events.sort((a, b) => {
    if (Math.abs(a.time - b.time) > EPS) return a.time - b.time;
    const prio: Record<Event["type"], number> = {
      sustain_off: 0,
      note_off: 1,
      sustain_on: 2,
      note_on: 3,
    } as const;
    return prio[a.type] - prio[b.type];
  });

  // State
  let sustainOn = false;
  const activeNotes = new Map<
    number,
    { startTime: number; midi: number; velocity: number }
  >();
  interface SustainedNoteEntry {
    index: number;
    startTime: number;
    velocity: number;
  }
  const sustainedNotes = new Map<number, SustainedNoteEntry[]>();
  const finalNotes = new Map<number, NoteData>();

  const releaseAllSustained = (t: number) => {
    for (const [pitch, stack] of sustainedNotes.entries()) {
      for (const s of stack) {
        const orig = notes[s.index];
        const dur = Math.max(EPS, t - s.startTime);
        finalNotes.set(s.index, { ...orig, duration: dur });
      }
    }
    sustainedNotes.clear();
  };

  const releasePitchFIFO = (pitch: number, t: number) => {
    const stack = sustainedNotes.get(pitch);
    if (stack && stack.length > 0) {
      const s = stack.shift()!;
      const orig = notes[s.index];
      const dur = Math.max(EPS, t - s.startTime);
      finalNotes.set(s.index, { ...orig, duration: dur });
      if (stack.length === 0) sustainedNotes.delete(pitch);
    }
  };

  for (const ev of events) {
    switch (ev.type) {
      case "sustain_on":
        sustainOn = true;
        break;
      case "sustain_off":
        sustainOn = false;
        releaseAllSustained(ev.time);
        break;
      case "note_on":
        if (ev.midi !== undefined) {
          // Re-striking same pitch cuts previous sustained instance
          releasePitchFIFO(ev.midi, ev.time);
          activeNotes.set(ev.index, {
            startTime: ev.time,
            midi: ev.midi,
            velocity: ev.velocity || 0,
          });
        }
        break;
      case "note_off":
        if (!activeNotes.has(ev.index)) break; // safety
        const info = activeNotes.get(ev.index)!;
        activeNotes.delete(ev.index);
        if (sustainOn && ev.midi !== undefined) {
          const stack = sustainedNotes.get(ev.midi) ?? [];
          stack.push({
            index: ev.index,
            startTime: info.startTime,
            velocity: info.velocity,
          });
          sustainedNotes.set(ev.midi, stack);
        } else {
          if (!finalNotes.has(ev.index))
            finalNotes.set(ev.index, notes[ev.index]);
        }
        break;
    }
  }

  // Release any remaining sustained notes at the end of file
  const maxEnd = Math.max(...notes.map((n) => n.time + n.duration));
  if (sustainedNotes.size > 0) releaseAllSustained(maxEnd);

  // Any remaining active notes -> keep original
  for (const [idx] of activeNotes) {
    if (!finalNotes.has(idx)) finalNotes.set(idx, notes[idx]);
  }

  // Build final array preserving index order, then sort by time, pitch
  const out: NoteData[] = [];
  for (let i = 0; i < notes.length; i++)
    out.push(finalNotes.get(i) ?? notes[i]);
  out.sort((a, b) =>
    Math.abs(a.time - b.time) > EPS ? a.time - b.time : a.midi - b.midi
  );
  return out;
}

/**
 * Safe wrapper with validation and optional max elongation.
 */
export function applySustainPedalElongationSafe(
  notes: NoteData[],
  controlChanges: ControlChangeEvent[],
  options: {
    threshold?: number;
    channel?: number;
    maxElongation?: number;
    verbose?: boolean;
  } = {}
): NoteData[] {
  const {
    threshold = 64,
    channel = 0,
    maxElongation = 30,
    verbose = false,
  } = options;
  try {
    if (!Array.isArray(notes) || !Array.isArray(controlChanges)) {
      if (verbose) console.warn("Invalid input to sustain pedal elongation");
      return notes;
    }
    let res = applySustainPedalElongation(
      notes,
      controlChanges,
      threshold,
      channel
    );
    if (maxElongation > 0) {
      res = res.map((n) =>
        n.duration > maxElongation ? { ...n, duration: maxElongation } : n
      );
    }
    const invalid = res.filter(
      (n) => n.duration <= 0 || !isFinite(n.duration) || !isFinite(n.time)
    );
    if (invalid.length > 0) {
      if (verbose)
        console.warn(
          `Found ${invalid.length} invalid notes after sustain processing`
        );
      res = res.filter(
        (n) => n.duration > 0 && isFinite(n.duration) && isFinite(n.time)
      );
    }
    return res;
  } catch (err) {
    if (verbose) console.error("Error applying sustain pedal elongation:", err);
    return notes;
  }
}

/**
 * Analyze sustain pedal usage from CC64 events.
 */
export function analyzeSustainPedalUsage(
  controlChanges: ControlChangeEvent[],
  threshold: number = 64
): {
  hasSustain: boolean;
  sustainCount: number;
  averageSustainDuration: number;
  totalSustainTime: number;
  sustainRegions: SustainRegion[];
} {
  const events = controlChanges
    .filter((cc) => cc.controller === 64)
    .sort((a, b) => a.time - b.time);
  if (events.length === 0) {
    return {
      hasSustain: false,
      sustainCount: 0,
      averageSustainDuration: 0,
      totalSustainTime: 0,
      sustainRegions: [],
    };
  }
  const thr = threshold / 127;
  const regions: SustainRegion[] = [];
  let start: number | null = null;
  let on = false;
  for (const e of events) {
    const shouldOn = (e.value ?? 0) >= thr;
    if (shouldOn && !on) {
      start = e.time;
      on = true;
    } else if (!shouldOn && on && start !== null) {
      const dur = e.time - start;
      regions.push({ start, end: e.time, duration: dur });
      start = null;
      on = false;
    }
  }
  if (on && start !== null) {
    const assumedEnd = events[events.length - 1].time + 5;
    regions.push({ start, end: assumedEnd, duration: assumedEnd - start });
  }
  const total = regions.reduce((s, r) => s + r.duration, 0);
  const avg = regions.length > 0 ? total / regions.length : 0;
  return {
    hasSustain: true,
    sustainCount: regions.length,
    averageSustainDuration: avg,
    totalSustainTime: total,
    sustainRegions: regions,
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
    const noteTracks = midi.tracks.filter(
      (t: any) => t.notes && t.notes.length > 0
    );
    if (noteTracks.length === 0) {
      throw new Error("No tracks with notes found in MIDI file");
    }

    // Step 5: Extract track metadata (use the first track name/channel for compatibility)
    const primaryTrack = noteTracks[0];
    const track = extractTrackMetadata(primaryTrack, 0);

    // Step 6: Build TrackInfo array and convert notes with trackId
    const applyPedal = options.applyPedalElongate !== false; // default ON
    const threshold = options.pedalThreshold ?? 64;
    const mergedNotes: NoteData[] = [];
    const tracks: TrackInfo[] = [];

    for (let trackIndex = 0; trackIndex < noteTracks.length; trackIndex++) {
      const t = noteTracks[trackIndex];
      const channel = t.channel ?? 0;
      const program = t.instrument?.number ?? 0;
      const isDrum = channel === 9 || channel === 10;
      const instrumentFamily = getInstrumentFamily(program, channel);

      // Create TrackInfo for this track
      // Always show program number for clarity
      let trackName: string;
      if (isDrum) {
        // Drum tracks: "Drums (ch.9)" or "Drums (ch.10)"
        trackName = t.name
          ? `${t.name} (ch.${channel})`
          : `Drums (ch.${channel})`;
      } else if (t.name) {
        // Named tracks: "Track Name (program)"
        trackName = `${t.name} (${program})`;
      } else {
        // Unnamed tracks: "Acoustic Grand Piano (0)"
        trackName = `${getGMInstrumentDisplayName(program)} (${program})`;
      }

      const trackInfo: TrackInfo = {
        id: trackIndex,
        name: trackName,
        channel,
        program,
        isDrum,
        instrumentFamily,
        noteCount: t.notes.length,
      };
      tracks.push(trackInfo);

      // Convert notes with trackId
      let trackNotes: NoteData[] = t.notes.map((n: any) =>
        convertNote(n, trackIndex)
      );

      if (applyPedal) {
        // Extract CC exclusively from this track (channel)
        const cc = extractControlChanges(t);
        if (cc.some((e) => e.controller === 64)) {
          // Use the enhanced sustain-pedal elongation which follows
          // onsets-and-frames ordering (sustain_off > note_off > sustain_on > note_on)
          trackNotes = applySustainPedalElongation(
            trackNotes,
            cc,
            threshold,
            channel
          );
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
      const cc = extractControlChanges(t).map((evt) => ({
        ...evt,
        fileId: primaryTrack.name,
      }));
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
      tracks, // detailed track info for multi-instrument support
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse MIDI file: ${error.message}`);
    }
    throw new Error("Failed to parse MIDI file: Unknown error");
  }
}
