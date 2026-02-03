/**
 * Beat/measure grid calculation utilities.
 *
 * Converts MIDI tempo and time-signature events into absolute-time grid
 * markers that the piano-roll renderer can draw instead of (or alongside)
 * the default seconds-based grid.
 */

import type { TempoEvent, TimeSignatureEvent } from "@/lib/core/utils/midi/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GridMarker {
  /** Absolute time in seconds */
  readonly time: number;
  /** 1-based measure number */
  readonly measure: number;
  /** 1-based beat within the measure */
  readonly beat: number;
  /** True when this marker is the first beat of a measure */
  readonly isMeasureStart: boolean;
  /** Display label, e.g. "1", "1.2", "5 (3/4)" */
  readonly label: string;
  /** Active time signature at this marker */
  readonly timeSignature: {
    readonly numerator: number;
    readonly denominator: number;
  };
}

export type BeatGridResolution = "measures" | "beats" | "subdivisions";

export interface BeatGridConfig {
  readonly resolution: BeatGridResolution;
  /** Subdivision factor, e.g. 2 = eighth notes (only used when resolution is 'subdivisions') */
  readonly subdivisionFactor: number;
  /** Whether to append time-signature info at change points */
  readonly showTimeSignatureLabel: boolean;
}

export interface MusicalTimingData {
  readonly tempos: readonly TempoEvent[];
  readonly timeSignatures: readonly TimeSignatureEvent[];
  readonly ppq: number;
  /** First note time in seconds; used to detect pickup beats */
  readonly firstNoteTime?: number;
}

/** Sensible defaults for v1 (beats resolution, no subdivisions) */
export const DEFAULT_BEAT_GRID_CONFIG: Readonly<BeatGridConfig> = Object.freeze({
  resolution: "beats",
  subdivisionFactor: 2,
  showTimeSignatureLabel: true,
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface Segment {
  readonly startTime: number;
  readonly bpm: number;
  readonly numerator: number;
  readonly denominator: number;
}

/**
 * Merge tempo + time-signature events into a unified sorted segment list.
 * Each segment represents a region where both tempo and time signature are constant.
 */
function buildSegments(timing: MusicalTimingData): readonly Segment[] {
  // Sort events by time (non-mutating)
  const tempos = [...timing.tempos].sort((a, b) => a.time - b.time);
  const timeSigs = [...timing.timeSignatures].sort((a, b) => a.time - b.time);

  // Collect all unique change-point times
  const changeTimesSet = new Set<number>();
  changeTimesSet.add(0);
  for (const t of tempos) changeTimesSet.add(t.time);
  for (const ts of timeSigs) changeTimesSet.add(ts.time);

  const changeTimes = [...changeTimesSet].sort((a, b) => a - b);

  // Defaults: 120 BPM, 4/4 (will be overridden by events at t <= changeTime)
  let currentBpm = 120;
  let currentNum = 4;
  let currentDen = 4;

  const segments: Segment[] = [];

  for (const time of changeTimes) {
    // Apply all tempo events at or before this change point
    for (const t of tempos) {
      if (t.time <= time) currentBpm = t.bpm;
      else break;
    }
    // Apply all time-signature events at or before this change point
    for (const ts of timeSigs) {
      if (ts.time <= time) {
        currentNum = ts.numerator;
        currentDen = ts.denominator;
      } else break;
    }

    segments.push({
      startTime: time,
      bpm: currentBpm,
      numerator: currentNum,
      denominator: currentDen,
    });
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Build an array of beat/measure grid markers from MIDI timing data.
 *
 * The algorithm iterates through segments (regions of constant tempo +
 * time signature) and emits markers at each beat boundary.
 *
 * To avoid floating-point drift, each beat's time is computed as
 * `segmentStartTime + beatIndex * secondsPerBeat` rather than accumulated.
 */
export function buildBeatMap(
  timing: MusicalTimingData,
  maxTimeSeconds: number,
  config: BeatGridConfig = DEFAULT_BEAT_GRID_CONFIG,
): ReadonlyArray<Readonly<GridMarker>> {
  if (!timing || (timing.tempos.length === 0 && timing.timeSignatures.length === 0)) {
    return [];
  }

  const segments = buildSegments(timing);
  if (segments.length === 0) return [];

  // Detect pickup beat: if first note doesn't land on beat 1 of a measure,
  // start measure numbering from 0 so that beat 1 of measure 1 aligns properly
  const firstSeg = segments[0];
  const firstSegSecondsPerBeat = 60 / firstSeg.bpm / (firstSeg.denominator / 4);
  const firstSegBeatsPerMeasure = firstSeg.numerator;

  let startMeasure = 1;
  if (timing.firstNoteTime !== undefined && timing.firstNoteTime > 0) {
    // Snap first note to nearest beat
    const snappedBeatIndex = Math.round(timing.firstNoteTime / firstSegSecondsPerBeat);
    // Which beat of the measure does this land on? (1-based)
    const beatInMeasure = (snappedBeatIndex % firstSegBeatsPerMeasure) + 1;

    if (beatInMeasure !== 1) {
      // First note is NOT on beat 1 → this is a pickup beat
      // Start from measure 0 so that the next beat 1 becomes measure 1
      startMeasure = 0;
    }
  }

  const markers: GridMarker[] = [];
  let measure = startMeasure;
  let beat = 1;

  // Track the previous time signature so we can detect changes
  let prevNum = -1;
  let prevDen = -1;

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    // Use strict less-than for segment boundary to avoid duplicate markers
    // at the exact boundary time (next segment will emit that marker)
    const nextSegStart = si + 1 < segments.length ? segments[si + 1].startTime : Infinity;

    const secondsPerBeat = 60 / seg.bpm / (seg.denominator / 4);
    const beatsPerMeasure = seg.numerator;

    const tsChanged = seg.numerator !== prevNum || seg.denominator !== prevDen;
    prevNum = seg.numerator;
    prevDen = seg.denominator;

    // If time signature changed at this segment, reset beat to 1 of new measure
    if (tsChanged && si > 0) {
      beat = 1;
      if (seg.startTime > 0) {
        measure++;
      }
    }

    // Generate markers within this segment
    let beatIndex = 0;
    let time = seg.startTime + beatIndex * secondsPerBeat;

    while (time <= maxTimeSeconds + 1e-9) {
      // Stop before next segment boundary (next segment handles its own start)
      if (si + 1 < segments.length && time >= nextSegStart - 1e-12) break;

      // Snap very small values to zero
      const snappedTime = Math.abs(time) < 1e-12 ? 0 : time;

      if (snappedTime > maxTimeSeconds + 1e-9) break;

      const isMeasureStart = beat === 1;
      const ts = { numerator: seg.numerator, denominator: seg.denominator };

      // Build label
      let label: string;
      if (isMeasureStart) {
        label = `${measure}`;
        // Append time signature at change points
        if (tsChanged && beatIndex === 0 && config.showTimeSignatureLabel) {
          label = `${measure} (${seg.numerator}/${seg.denominator})`;
        }
      } else {
        label = `${measure}.${beat}`;
      }

      // Decide whether to include this marker based on resolution
      const shouldInclude =
        config.resolution === "beats" ||
        config.resolution === "subdivisions" ||
        (config.resolution === "measures" && isMeasureStart);

      if (shouldInclude) {
        markers.push(
          Object.freeze({
            time: snappedTime,
            measure,
            beat,
            isMeasureStart,
            label,
            timeSignature: ts,
          }),
        );
      }

      // Advance
      beat++;
      if (beat > beatsPerMeasure) {
        beat = 1;
        measure++;
      }

      beatIndex++;
      time = seg.startTime + beatIndex * secondsPerBeat;
    }
  }

  return Object.freeze(markers);
}

// ---------------------------------------------------------------------------
// Shallow equality helper
// ---------------------------------------------------------------------------

/**
 * Shallow comparison for MusicalTimingData to avoid redundant recalculations
 * in hot paths (e.g. visualization-handler calling setMusicalTiming every update).
 */
export function musicalTimingEqual(
  a: MusicalTimingData | null,
  b: MusicalTimingData | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.ppq !== b.ppq) return false;
  if (a.firstNoteTime !== b.firstNoteTime) return false;
  if (a.tempos.length !== b.tempos.length) return false;
  if (a.timeSignatures.length !== b.timeSignatures.length) return false;

  for (let i = 0; i < a.tempos.length; i++) {
    const at = a.tempos[i];
    const bt = b.tempos[i];
    if (at.time !== bt.time || at.bpm !== bt.bpm) return false;
  }

  for (let i = 0; i < a.timeSignatures.length; i++) {
    const ats = a.timeSignatures[i];
    const bts = b.timeSignatures[i];
    if (
      ats.time !== bts.time ||
      ats.numerator !== bts.numerator ||
      ats.denominator !== bts.denominator
    )
      return false;
  }

  return true;
}
