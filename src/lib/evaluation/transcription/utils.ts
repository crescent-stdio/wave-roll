import { ParsedMidi, NoteData, TempoEvent } from "@/lib/midi/types";

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

/**
 * Default BPM used when no tempo information is available.
 */
const DEFAULT_BPM = 120;

/**
 * Extract the initial BPM from a MIDI file's tempo events.
 * Uses the tempo event at or closest to time=0.
 * Falls back to DEFAULT_BPM (120) if no tempo events are present.
 *
 * @param tempos - Array of tempo events from ParsedMidi.header.tempos
 * @returns The initial BPM value (clamped between 20 and 300)
 */
export function getInitialBpm(tempos: TempoEvent[] | undefined): number {
  if (!tempos || tempos.length === 0) {
    return DEFAULT_BPM;
  }

  const EPS = 1e-3;
  // Find tempo events at or very close to time=0
  const atZero = tempos.filter((t) => Math.abs(t.time || 0) <= EPS);
  // Use the earliest tempo event
  const sorted = (atZero.length > 0 ? atZero : tempos).sort(
    (a, b) => (a.time || 0) - (b.time || 0)
  );
  const first = sorted[0];

  // Clamp BPM to reasonable range
  return Math.max(20, Math.min(300, first?.bpm || DEFAULT_BPM));
}

/**
 * Scale time intervals from one BPM to another.
 * This is used to align estimated MIDI notes to the reference BPM
 * when the two files have different tempos.
 *
 * Formula: scaledTime = originalTime * (targetBpm / sourceBpm)
 *
 * @param intervals - Array of [onset, offset] time intervals in seconds
 * @param sourceBpm - The original BPM of the intervals
 * @param targetBpm - The target BPM to scale to
 * @returns Scaled intervals with times adjusted for the target BPM
 */
export function scaleIntervalsForBpm(
  intervals: [number, number][],
  sourceBpm: number,
  targetBpm: number
): [number, number][] {
  // Avoid division by zero and skip if BPMs are effectively equal
  if (sourceBpm <= 0 || targetBpm <= 0) {
    return intervals;
  }

  const scale = targetBpm / sourceBpm;

  // Skip scaling if scale is very close to 1
  if (Math.abs(scale - 1) < 1e-6) {
    return intervals;
  }

  return intervals.map(([onset, offset]) => [onset * scale, offset * scale]);
}

/**
 * Extract intervals, pitches, and BPM from a ParsedMidi object.
 * This is an extended version of parsedMidiToIntervalsAndPitches that
 * also extracts BPM information for tempo-aware matching.
 */
export function parsedMidiToIntervalsAndPitchesWithBpm(parsed: ParsedMidi): {
  intervals: [number, number][];
  pitches: number[];
  bpm: number;
} {
  const { intervals, pitches } = notesToIntervalsAndPitches(parsed.notes);
  const bpm = getInitialBpm(parsed.header?.tempos);
  return { intervals, pitches, bpm };
}
