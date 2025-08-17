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

/**
 * Validate inputs akin to mir_eval.transcription.validate
 * Ensures array lengths match and intervals are well-formed.
 * Throws an Error when validation fails.
 */
export function validateTranscriptionInputs(
  reference_intervals: [number, number][],
  reference_pitches: number[],
  estimated_intervals: [number, number][],
  estimated_pitches: number[]
): void {
  if (reference_intervals.length !== reference_pitches.length) {
    throw new Error(
      "Reference intervals and pitches must have the same length"
    );
  }
  if (estimated_intervals.length !== estimated_pitches.length) {
    throw new Error(
      "Estimated intervals and pitches must have the same length"
    );
  }

  function validateIntervals(label: string, intervals: [number, number][]) {
    for (let i = 0; i < intervals.length; i++) {
      const [start, end] = intervals[i];
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        throw new Error(
          `${label} interval has non-finite values at index ${i}`
        );
      }
      if (end < start) {
        throw new Error(
          `${label} interval must satisfy end >= start at index ${i}`
        );
      }
    }
  }

  function validatePitches(label: string, pitches: number[]) {
    for (let i = 0; i < pitches.length; i++) {
      const p = pitches[i];
      if (!Number.isFinite(p)) {
        throw new Error(`${label} pitch is not finite at index ${i}`);
      }
    }
  }

  validateIntervals("Reference", reference_intervals);
  validateIntervals("Estimated", estimated_intervals);
  validatePitches("Reference", reference_pitches);
  validatePitches("Estimated", estimated_pitches);
}

/**
 * Convert MIDI pitches to chroma (pitch class in [0, 12)).
 */
export function toChromaPitches(pitches: number[]): number[] {
  return pitches.map((p) => {
    const m = ((p % 12) + 12) % 12;
    return m;
  });
}

/**
 * Compute intersection-over-union (IoU) for two intervals [a0,a1], [b0,b1].
 */
export function intervalIoU(a: [number, number], b: [number, number]): number {
  const inter = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
  const union = Math.max(a[1], b[1]) - Math.min(a[0], b[0]);
  return union > 0 ? inter / union : 0;
}
