import { TranscriptionToleranceOptions, DEFAULT_TOLERANCES } from "./constants";
import {
  parsedMidiToIntervalsAndPitches,
  validateTranscriptionInputs,
} from "./utils";
import { ParsedMidi } from "@/lib/midi/types";

/**
 * Result of a note-level matching operation.
 */
export interface NoteMatchResult {
  /** Pairs of matched reference-estimated indices */
  matches: Array<{
    ref: number;
    est: number;
    refPitch: number;
    estPitch: number;
    refTime: number;
    estTime: number;
  }>;
  /** Indices of unmatched reference notes */
  falseNegatives: number[];
  /** Indices of unmatched estimated notes */
  falsePositives: number[];
}

/**
 * Build adjacency lists for bipartite matching: edge (i -> j) exists if the
 * reference note i and estimated note j satisfy mir_eval.transcription.match_notes
 * tolerances (onset, pitch, and offset criteria).
 */
function buildAdjacency(
  refIntervals: [number, number][],
  refPitches: number[],
  estIntervals: [number, number][],
  estPitches: number[],
  onsetTolerance: number,
  pitchTolerance: number,
  offsetRatioTolerance: number,
  offsetMinTolerance: number
): number[][] {
  const adj: number[][] = Array.from({ length: refIntervals.length }, () => []);
  for (let i = 0; i < refIntervals.length; i++) {
    const [refOn, refOff] = refIntervals[i];
    const refPitch = refPitches[i];
    const refDur = refOff - refOn;
    const effectiveOffsetTol = Math.max(
      offsetMinTolerance,
      offsetRatioTolerance * Math.max(0, refDur)
    );

    for (let j = 0; j < estIntervals.length; j++) {
      const [estOn, estOff] = estIntervals[j];
      const estPitch = estPitches[j];

      const onsetDiff = Math.abs(estOn - refOn);
      const pitchDiff = Math.abs(estPitch - refPitch);
      const offsetDiff = Math.abs(estOff - refOff);

      if (
        onsetDiff <= onsetTolerance &&
        pitchDiff <= pitchTolerance &&
        offsetDiff <= effectiveOffsetTol
      ) {
        adj[i].push(j);
      }
    }
  }
  return adj;
}

/**
 * Build adjacency with onset + pitch gating only (no offset constraint).
 */
function buildAdjacencyOnsetPitch(
  refIntervals: [number, number][],
  refPitches: number[],
  estIntervals: [number, number][],
  estPitches: number[],
  onsetTolerance: number,
  pitchTolerance: number
): number[][] {
  const adj: number[][] = Array.from({ length: refIntervals.length }, () => []);
  for (let i = 0; i < refIntervals.length; i++) {
    const [refOn] = refIntervals[i];
    const refPitch = refPitches[i];
    for (let j = 0; j < estIntervals.length; j++) {
      const [estOn] = estIntervals[j];
      const estPitch = estPitches[j];
      const onsetDiff = Math.abs(estOn - refOn);
      const pitchDiff = Math.abs(estPitch - refPitch);
      if (onsetDiff <= onsetTolerance && pitchDiff <= pitchTolerance) {
        adj[i].push(j);
      }
    }
  }
  return adj;
}

/**
 * Build adjacency using chroma pitch equivalence. Pitch distance is measured
 * modulo 12 semitones: diff = min(|diff| mod 12, 12 - (|diff| mod 12)).
 */
function buildAdjacencyChroma(
  refIntervals: [number, number][],
  refPitches: number[],
  estIntervals: [number, number][],
  estPitches: number[],
  onsetTolerance: number,
  pitchTolerance: number,
  offsetRatioTolerance: number,
  offsetMinTolerance: number
): number[][] {
  const adj: number[][] = Array.from({ length: refIntervals.length }, () => []);
  for (let i = 0; i < refIntervals.length; i++) {
    const [refOn, refOff] = refIntervals[i];
    const refPitch = refPitches[i];
    const refDur = refOff - refOn;
    const effectiveOffsetTol = Math.max(
      offsetMinTolerance,
      offsetRatioTolerance * Math.max(0, refDur)
    );

    for (let j = 0; j < estIntervals.length; j++) {
      const [estOn, estOff] = estIntervals[j];
      const estPitch = estPitches[j];

      const onsetDiff = Math.abs(estOn - refOn);
      const rawPitchDiff = Math.abs(estPitch - refPitch);
      const wrap = rawPitchDiff % 12;
      const chromaPitchDiff = Math.min(wrap, 12 - wrap);
      const offsetDiff = Math.abs(estOff - refOff);

      if (
        onsetDiff <= onsetTolerance &&
        chromaPitchDiff <= pitchTolerance &&
        offsetDiff <= effectiveOffsetTol
      ) {
        adj[i].push(j);
      }
    }
  }
  return adj;
}

/**
 * Build adjacency using chroma pitch with onset-only constraint (no offset gating).
 */
function buildAdjacencyChromaOnsetOnly(
  refIntervals: [number, number][],
  refPitches: number[],
  estIntervals: [number, number][],
  estPitches: number[],
  onsetTolerance: number,
  pitchTolerance: number
): number[][] {
  const adj: number[][] = Array.from({ length: refIntervals.length }, () => []);
  for (let i = 0; i < refIntervals.length; i++) {
    const [refOn] = refIntervals[i];
    const refPitch = refPitches[i];
    for (let j = 0; j < estIntervals.length; j++) {
      const [estOn] = estIntervals[j];
      const estPitch = estPitches[j];
      const onsetDiff = Math.abs(estOn - refOn);
      const rawPitchDiff = Math.abs(estPitch - refPitch);
      const wrap = rawPitchDiff % 12;
      const chromaPitchDiff = Math.min(wrap, 12 - wrap);
      if (onsetDiff <= onsetTolerance && chromaPitchDiff <= pitchTolerance) {
        adj[i].push(j);
      }
    }
  }
  return adj;
}

/**
 * Hopcroft-Karp maximum bipartite matching.
 * Left set U has size `numLeft` (reference notes), right set V has size `numRight` (estimated notes).
 * `adj[u]` lists v-indices connected to u.
 */
function hopcroftKarp(
  adj: number[][],
  numLeft: number,
  numRight: number
): { pairU: number[]; pairV: number[]; matchingSize: number } {
  const INF = Number.POSITIVE_INFINITY;
  const pairU: number[] = Array(numLeft).fill(-1);
  const pairV: number[] = Array(numRight).fill(-1);
  const dist: number[] = Array(numLeft).fill(0);

  function bfs(): boolean {
    const queue: number[] = [];
    for (let u = 0; u < numLeft; u++) {
      if (pairU[u] === -1) {
        dist[u] = 0;
        queue.push(u);
      } else {
        dist[u] = INF;
      }
    }

    let foundAugmentingPath = false;
    while (queue.length > 0) {
      const u = queue.shift() as number;
      for (const v of adj[u]) {
        const u2 = pairV[v];
        if (u2 !== -1) {
          if (dist[u2] === INF) {
            dist[u2] = dist[u] + 1;
            queue.push(u2);
          }
        } else {
          // Found an unmatched vertex on V; there exists an augmenting path
          foundAugmentingPath = true;
        }
      }
    }
    return foundAugmentingPath;
  }

  function dfs(u: number): boolean {
    for (const v of adj[u]) {
      const u2 = pairV[v];
      if (u2 === -1 || (dist[u2] === dist[u] + 1 && dfs(u2))) {
        pairU[u] = v;
        pairV[v] = u;
        return true;
      }
    }
    dist[u] = Number.POSITIVE_INFINITY;
    return false;
  }

  let matchingSize = 0;
  while (bfs()) {
    for (let u = 0; u < numLeft; u++) {
      if (pairU[u] === -1 && dfs(u)) {
        matchingSize += 1;
      }
    }
  }

  return { pairU, pairV, matchingSize };
}

/**
 * Match notes between reference and estimated MIDI representations following
 * the criteria used by `mir_eval.transcription.match_notes`.
 *
 * A reference and estimated note are considered a match when:
 * - their onsets differ by at most `onsetTolerance` seconds.
 * - their pitches (in MIDI) differ by at most `pitchTolerance`.
 * - their offsets differ by at most `max(offsetMinTolerance, offsetRatioTolerance x referenceDuration)`.
 *
 * Each reference (estimated) note can be matched to at most one estimated
 * (reference) note. We compute the maximum bipartite matching subject to the
 * above constraints (Hopcroft-Karp), which mirrors the behavior of mir_eval's
 * unique assignment policy.
 */
export function matchNotes(
  reference: ParsedMidi,
  estimated: ParsedMidi,
  options: Partial<TranscriptionToleranceOptions> = {}
): NoteMatchResult {
  const {
    onsetTolerance,
    pitchTolerance,
    offsetRatioTolerance,
    offsetMinTolerance,
  } = {
    ...DEFAULT_TOLERANCES,
    ...options,
  };

  const refData = parsedMidiToIntervalsAndPitches(reference);
  const estData = parsedMidiToIntervalsAndPitches(estimated);

  const adj = buildAdjacency(
    refData.intervals,
    refData.pitches,
    estData.intervals,
    estData.pitches,
    onsetTolerance,
    pitchTolerance,
    offsetRatioTolerance,
    offsetMinTolerance
  );

  const { pairU, pairV } = hopcroftKarp(
    adj,
    refData.intervals.length,
    estData.intervals.length
  );

  const matches: Array<{
    ref: number;
    est: number;
    refPitch: number;
    estPitch: number;
    refTime: number;
    estTime: number;
  }> = [];
  for (let refIdx = 0; refIdx < pairU.length; refIdx++) {
    const estIdx = pairU[refIdx];
    if (estIdx !== -1) {
      const [refOnset] = refData.intervals[refIdx];
      const [estOnset] = estData.intervals[estIdx];
      matches.push({
        ref: refIdx,
        est: estIdx,
        refPitch: refData.pitches[refIdx],
        estPitch: estData.pitches[estIdx],
        refTime: refOnset,
        estTime: estOnset,
      });
    }
  }

  const falseNegatives: number[] = [];
  for (let i = 0; i < pairU.length; i++) {
    if (pairU[i] === -1) falseNegatives.push(i);
  }
  const falsePositives: number[] = [];
  for (let j = 0; j < pairV.length; j++) {
    if (pairV[j] === -1) falsePositives.push(j);
  }

  return { matches, falseNegatives, falsePositives };
}

/**
 * mir_eval-style function signature using explicit arrays.
 * Provided for parity with `mir_eval.transcription.match_notes`.
 */
export function match_notes(
  reference_intervals: [number, number][],
  reference_pitches: number[],
  estimated_intervals: [number, number][],
  estimated_pitches: number[],
  onset_tolerance: number = DEFAULT_TOLERANCES.onsetTolerance,
  pitch_tolerance: number = 50.0
): NoteMatchResult {
  validateTranscriptionInputs(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches
  );

  const pitchTolSemitones = pitch_tolerance / 100; // cents -> semitones

  const adj = buildAdjacencyOnsetPitch(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches,
    onset_tolerance,
    pitchTolSemitones
  );

  const { pairU, pairV } = hopcroftKarp(
    adj,
    reference_intervals.length,
    estimated_intervals.length
  );

  const matches: NoteMatchResult["matches"] = [];
  for (let refIdx = 0; refIdx < pairU.length; refIdx++) {
    const estIdx = pairU[refIdx];
    if (estIdx !== -1) {
      matches.push({
        ref: refIdx,
        est: estIdx,
        refPitch: reference_pitches[refIdx],
        estPitch: estimated_pitches[estIdx],
        refTime: reference_intervals[refIdx][0],
        estTime: estimated_intervals[estIdx][0],
      });
    }
  }

  const falseNegatives: number[] = [];
  for (let i = 0; i < pairU.length; i++) {
    if (pairU[i] === -1) falseNegatives.push(i);
  }
  const falsePositives: number[] = [];
  for (let j = 0; j < pairV.length; j++) {
    if (pairV[j] === -1) falsePositives.push(j);
  }

  return { matches, falseNegatives, falsePositives };
}

/**
 * mir_eval-style match with onset+pitch+offset tolerance.
 */
export function match_notes_with_offset(
  reference_intervals: [number, number][],
  reference_pitches: number[],
  estimated_intervals: [number, number][],
  estimated_pitches: number[],
  onset_tolerance: number = DEFAULT_TOLERANCES.onsetTolerance,
  pitch_tolerance: number = 50.0,
  offset_ratio_tolerance: number = DEFAULT_TOLERANCES.offsetRatioTolerance,
  offset_min_tolerance: number = DEFAULT_TOLERANCES.offsetMinTolerance
): NoteMatchResult {
  validateTranscriptionInputs(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches
  );

  const pitchTolSemitones = pitch_tolerance / 100; // cents -> semitones

  const adj = buildAdjacency(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches,
    onset_tolerance,
    pitchTolSemitones,
    offset_ratio_tolerance,
    offset_min_tolerance
  );

  const { pairU, pairV } = hopcroftKarp(
    adj,
    reference_intervals.length,
    estimated_intervals.length
  );

  const matches: NoteMatchResult["matches"] = [];
  for (let refIdx = 0; refIdx < pairU.length; refIdx++) {
    const estIdx = pairU[refIdx];
    if (estIdx !== -1) {
      matches.push({
        ref: refIdx,
        est: estIdx,
        refPitch: reference_pitches[refIdx],
        estPitch: estimated_pitches[estIdx],
        refTime: reference_intervals[refIdx][0],
        estTime: estimated_intervals[estIdx][0],
      });
    }
  }

  const falseNegatives: number[] = [];
  for (let i = 0; i < pairU.length; i++) {
    if (pairU[i] === -1) falseNegatives.push(i);
  }
  const falsePositives: number[] = [];
  for (let j = 0; j < pairV.length; j++) {
    if (pairV[j] === -1) falsePositives.push(j);
  }

  return { matches, falseNegatives, falsePositives };
}

/**
 * Chroma version of match_notes where pitch is compared mod 12.
 */
export function match_notes_chroma(
  reference_intervals: [number, number][],
  reference_pitches: number[],
  estimated_intervals: [number, number][],
  estimated_pitches: number[],
  onset_tolerance: number = DEFAULT_TOLERANCES.onsetTolerance,
  pitch_tolerance: number = 50.0,
  offset_ratio_tolerance: number = DEFAULT_TOLERANCES.offsetRatioTolerance,
  offset_min_tolerance: number = DEFAULT_TOLERANCES.offsetMinTolerance
): NoteMatchResult {
  validateTranscriptionInputs(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches
  );

  const pitchTolSemitones = pitch_tolerance / 100; // cents -> semitones

  const adj = buildAdjacencyChroma(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches,
    onset_tolerance,
    pitchTolSemitones,
    offset_ratio_tolerance,
    offset_min_tolerance
  );

  const { pairU, pairV } = hopcroftKarp(
    adj,
    reference_intervals.length,
    estimated_intervals.length
  );

  const matches: NoteMatchResult["matches"] = [];
  for (let refIdx = 0; refIdx < pairU.length; refIdx++) {
    const estIdx = pairU[refIdx];
    if (estIdx !== -1) {
      matches.push({
        ref: refIdx,
        est: estIdx,
        refPitch: reference_pitches[refIdx],
        estPitch: estimated_pitches[estIdx],
        refTime: reference_intervals[refIdx][0],
        estTime: estimated_intervals[estIdx][0],
      });
    }
  }

  const falseNegatives: number[] = [];
  for (let i = 0; i < pairU.length; i++) {
    if (pairU[i] === -1) falseNegatives.push(i);
  }
  const falsePositives: number[] = [];
  for (let j = 0; j < pairV.length; j++) {
    if (pairV[j] === -1) falsePositives.push(j);
  }

  return { matches, falseNegatives, falsePositives };
}

/**
 * Chroma match with onset+pitch only (no offset gating). Useful for
 * chroma_precision_recall_f1.
 */
export function match_notes_chroma_onset(
  reference_intervals: [number, number][],
  reference_pitches: number[],
  estimated_intervals: [number, number][],
  estimated_pitches: number[],
  onset_tolerance: number = DEFAULT_TOLERANCES.onsetTolerance,
  pitch_tolerance: number = 50.0
): NoteMatchResult {
  validateTranscriptionInputs(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches
  );

  const pitchTolSemitones = pitch_tolerance / 100; // cents -> semitones

  const adj = buildAdjacencyChromaOnsetOnly(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches,
    onset_tolerance,
    pitchTolSemitones
  );

  const { pairU, pairV } = hopcroftKarp(
    adj,
    reference_intervals.length,
    estimated_intervals.length
  );

  const matches: NoteMatchResult["matches"] = [];
  for (let refIdx = 0; refIdx < pairU.length; refIdx++) {
    const estIdx = pairU[refIdx];
    if (estIdx !== -1) {
      matches.push({
        ref: refIdx,
        est: estIdx,
        refPitch: reference_pitches[refIdx],
        estPitch: estimated_pitches[estIdx],
        refTime: reference_intervals[refIdx][0],
        estTime: estimated_intervals[estIdx][0],
      });
    }
  }

  const falseNegatives: number[] = [];
  for (let i = 0; i < pairU.length; i++) {
    if (pairU[i] === -1) falseNegatives.push(i);
  }
  const falsePositives: number[] = [];
  for (let j = 0; j < pairV.length; j++) {
    if (pairV[j] === -1) falsePositives.push(j);
  }

  return { matches, falseNegatives, falsePositives };
}
