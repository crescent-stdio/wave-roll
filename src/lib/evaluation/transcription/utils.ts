import { ParsedMidi, NoteData } from "@/lib/midi/types";

/**
 * Convert a list of `NoteData` into parallel arrays of intervals and pitches.
 * @param notes Array of `NoteData` objects
 * @returns Tuple of intervals [[onset, offset], …] and pitches (MIDI numbers)
 */
export function notesToIntervalsAndPitches(notes: NoteData[]): {
  intervals: [number, number][];
  pitches: number[];
} {
  const intervals: [number, number][] = [];
  const pitches: number[] = [];

  for (const n of notes) {
    const onset = n.time;
    const offset = n.time + n.duration;
    intervals.push([onset, offset]);
    pitches.push(n.midi);
  }

  return { intervals, pitches };
}

/**
 * Convenience wrapper to extract intervals and pitches directly from `ParsedMidi`.
 */
export function parsedMidiToIntervalsAndPitches(parsed: ParsedMidi) {
  return notesToIntervalsAndPitches(parsed.notes);
}
