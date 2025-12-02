/**
 * Note-level transcription matching utilities.
 *
 * This implementation is designed for logical equivalence with
 * mir_eval.transcription note matching (onset/pitch/offset gating with unique
 * assignment). We do not copy code from mir_eval; instead we document the
 * intended behaviour and provide our own TypeScript implementation.
 *
 * Reference: https://github.com/mir-evaluation/mir_eval
 */
import {
  TranscriptionToleranceOptions,
  VelocityToleranceOptions,
  DEFAULT_TOLERANCES,
  DEFAULT_VELOCITY_OPTIONS,
} from "./constants";
import {
  parsedMidiToIntervalsAndPitches,
  parsedMidiToIntervalsAndPitchesWithBpm,
  scaleIntervalsForBpm,
  validateTranscriptionInputs,
} from "./utils";
import { ParsedMidi } from "@/lib/midi/types";
import type { MatchEntry } from "./types";

/**
 * Result of a note-level matching operation.
 */
export interface NoteMatchResult {
  /** Pairs of matched reference-estimated indices */
  matches: MatchEntry[];
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
 * Options for BPM-aware note matching.
 */
export interface BpmScalingOptions {
  /**
   * When true, scales the estimated MIDI's time intervals to match
   * the reference MIDI's BPM. This is useful when comparing MIDI files
   * with different tempos but the same musical content.
   *
   * Formula: scaledEstTime = estTime * (refBpm / estBpm)
   *
   * @default false
   */
  scaleBpmToReference?: boolean;
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
 *
 * @param reference - The reference (ground truth) MIDI data
 * @param estimated - The estimated (model output) MIDI data
 * @param options - Tolerance options for matching
 * @param bpmOptions - BPM scaling options for tempo-aware matching
 */
export function matchNotes(
  reference: ParsedMidi,
  estimated: ParsedMidi,
  options: Partial<TranscriptionToleranceOptions> = {},
  bpmOptions: BpmScalingOptions = {}
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

  const { scaleBpmToReference = false } = bpmOptions;

  // Extract intervals, pitches, and BPM from both MIDI files
  const refData = parsedMidiToIntervalsAndPitchesWithBpm(reference);
  const estData = parsedMidiToIntervalsAndPitchesWithBpm(estimated);

  // Optionally scale estimated intervals to match reference BPM
  let estIntervals = estData.intervals;
  if (scaleBpmToReference && estData.bpm !== refData.bpm) {
    estIntervals = scaleIntervalsForBpm(
      estData.intervals,
      estData.bpm,
      refData.bpm
    );
  }

  const adj = buildAdjacency(
    refData.intervals,
    refData.pitches,
    estIntervals,
    estData.pitches,
    onsetTolerance,
    pitchTolerance,
    offsetRatioTolerance,
    offsetMinTolerance
  );

  const { pairU, pairV } = hopcroftKarp(
    adj,
    refData.intervals.length,
    estIntervals.length
  );

  const matches: NoteMatchResult["matches"] = [];
  for (let refIdx = 0; refIdx < pairU.length; refIdx++) {
    const estIdx = pairU[refIdx];
    if (estIdx !== -1) {
      const [refOn, refOff] = refData.intervals[refIdx];
      // Use scaled intervals for comparison, but report original estTime
      const [scaledEstOn, scaledEstOff] = estIntervals[estIdx];
      const [origEstOn] = estData.intervals[estIdx];
      const refVel = reference.notes[refIdx]?.velocity;
      const estVel = estimated.notes[estIdx]?.velocity;
      const inter = Math.max(
        0,
        Math.min(refOff, scaledEstOff) - Math.max(refOn, scaledEstOn)
      );
      const union =
        Math.max(refOff, scaledEstOff) - Math.min(refOn, scaledEstOn);
      matches.push({
        ref: refIdx,
        est: estIdx,
        refPitch: refData.pitches[refIdx],
        estPitch: estData.pitches[estIdx],
        refTime: refOn,
        estTime: origEstOn, // Report original (unscaled) estimated time
        onsetDiff: Math.abs(scaledEstOn - refOn), // Diff using scaled time
        offsetDiff: Math.abs(scaledEstOff - refOff), // Diff using scaled time
        pitchDiff: Math.abs(estData.pitches[estIdx] - refData.pitches[refIdx]),
        overlapRatio: union > 0 ? inter / union : 0,
        refVelocity: typeof refVel === "number" ? refVel : undefined,
        estVelocity: typeof estVel === "number" ? estVel : undefined,
        velocityDiff:
          typeof refVel === "number" && typeof estVel === "number"
            ? Math.abs(estVel - refVel)
            : undefined,
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
 * Velocity-aware matching.
 *
 * This function mirrors `matchNotes` (onset/pitch/offset gating) and optionally
 * adds a velocity gate to the adjacency when `velocity.includeInMatching` is true.
 * It preserves the same 1:1 matching policy via Hopcroft-Karp and enriches
 * matches with per-pair diagnostics (diffs, overlap, velocities).
 *
 * @param reference - The reference (ground truth) MIDI data
 * @param estimated - The estimated (model output) MIDI data
 * @param options - Tolerance options for matching
 * @param velocity - Velocity tolerance options
 * @param bpmOptions - BPM scaling options for tempo-aware matching
 */
export function matchNotesWithVelocity(
  reference: ParsedMidi,
  estimated: ParsedMidi,
  options: Partial<TranscriptionToleranceOptions> = {},
  velocity: Partial<VelocityToleranceOptions> = {},
  bpmOptions: BpmScalingOptions = {}
): NoteMatchResult {
  const toler = { ...DEFAULT_TOLERANCES, ...options };
  const vopts = { ...DEFAULT_VELOCITY_OPTIONS, ...velocity };
  const { scaleBpmToReference = false } = bpmOptions;

  // Extract intervals, pitches, and BPM from both MIDI files
  const refData = parsedMidiToIntervalsAndPitchesWithBpm(reference);
  const estData = parsedMidiToIntervalsAndPitchesWithBpm(estimated);

  // Optionally scale estimated intervals to match reference BPM
  let estIntervals = estData.intervals;
  if (scaleBpmToReference && estData.bpm !== refData.bpm) {
    estIntervals = scaleIntervalsForBpm(
      estData.intervals,
      estData.bpm,
      refData.bpm
    );
  }

  // Build base adjacency first (onset/pitch/offset)
  const baseAdj = buildAdjacency(
    refData.intervals,
    refData.pitches,
    estIntervals,
    estData.pitches,
    toler.onsetTolerance,
    toler.pitchTolerance,
    toler.offsetRatioTolerance,
    toler.offsetMinTolerance
  );

  // Optionally filter edges by velocity tolerance
  const toNorm = (dv: number): number =>
    vopts.unit === "midi" ? dv / 127 : dv;
  const tolNorm =
    vopts.unit === "midi"
      ? vopts.velocityTolerance / 127
      : vopts.velocityTolerance;

  const adj = vopts.includeInMatching
    ? baseAdj.map((neighbors, i) =>
        neighbors.filter((j) => {
          const rv = reference.notes[i]?.velocity;
          const ev = estimated.notes[j]?.velocity;
          if (typeof rv !== "number" || typeof ev !== "number") {
            return vopts.missingVelocity === "ignore";
          }
          const dv = Math.abs(ev - rv);
          return toNorm(dv) <= tolNorm;
        })
      )
    : baseAdj;

  const { pairU, pairV } = hopcroftKarp(
    adj,
    refData.intervals.length,
    estIntervals.length
  );

  const matches: NoteMatchResult["matches"] = [];
  for (let refIdx = 0; refIdx < pairU.length; refIdx++) {
    const estIdx = pairU[refIdx];
    if (estIdx !== -1) {
      const [refOn, refOff] = refData.intervals[refIdx];
      // Use scaled intervals for comparison, but report original estTime
      const [scaledEstOn, scaledEstOff] = estIntervals[estIdx];
      const [origEstOn] = estData.intervals[estIdx];
      const rv = reference.notes[refIdx]?.velocity;
      const ev = estimated.notes[estIdx]?.velocity;
      const inter = Math.max(
        0,
        Math.min(refOff, scaledEstOff) - Math.max(refOn, scaledEstOn)
      );
      const union =
        Math.max(refOff, scaledEstOff) - Math.min(refOn, scaledEstOn);
      matches.push({
        ref: refIdx,
        est: estIdx,
        refPitch: refData.pitches[refIdx],
        estPitch: estData.pitches[estIdx],
        refTime: refOn,
        estTime: origEstOn, // Report original (unscaled) estimated time
        onsetDiff: Math.abs(scaledEstOn - refOn), // Diff using scaled time
        offsetDiff: Math.abs(scaledEstOff - refOff), // Diff using scaled time
        pitchDiff: Math.abs(estData.pitches[estIdx] - refData.pitches[refIdx]),
        overlapRatio: union > 0 ? inter / union : 0,
        refVelocity: typeof rv === "number" ? rv : undefined,
        estVelocity: typeof ev === "number" ? ev : undefined,
        velocityDiff:
          typeof rv === "number" && typeof ev === "number"
            ? Math.abs(ev - rv)
            : undefined,
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
