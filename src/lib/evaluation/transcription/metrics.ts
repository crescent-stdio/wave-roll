/**
 * Note and velocity-level evaluation metrics.
 *
 * The functions in this module follow the intent of mir_eval's transcription
 * metrics: match notes under onset/pitch/offset tolerances with a unique
 * assignment and compute PRF-style measures. Velocity-aware diagnostics are
 * integrated as a first-class feature while keeping backward-compatible APIs.
 *
 * Reference: https://github.com/mir-evaluation/mir_eval
 */
import {
  matchNotes,
  matchNotesWithVelocity,
  NoteMatchResult,
  match_notes,
  match_notes_with_offset,
  match_notes_chroma,
  match_notes_chroma_onset,
} from "./matchNotes";
import { ParsedMidi } from "@/lib/midi/types";
import {
  TranscriptionToleranceOptions,
  VelocityToleranceOptions,
  DEFAULT_VELOCITY_OPTIONS,
} from "./constants";

export interface NoteMetrics {
  precision: number;
  recall: number;
  f1: number;
  f_measure: number;
  avgOverlapRatio: number;
  numCorrect: number;
  numRef: number;
  numEst: number;
  /** Detailed match pairs between reference and estimated notes */
  matches: NoteMatchResult["matches"];
  /** Unmatched reference indices */
  falseNegatives?: number[];
  /** Unmatched estimated indices */
  falsePositives?: number[];
}

export function computeNoteMetrics(
  reference: ParsedMidi,
  estimated: ParsedMidi,
  options: Partial<TranscriptionToleranceOptions> = {}
): NoteMetrics {
  const matchResult: NoteMatchResult = matchNotes(
    reference,
    estimated,
    options
  );

  // console.log("matchResult.matches", matchResult.matches);

  const numCorrect = matchResult.matches.length;
  const numRef = reference.notes.length;
  const numEst = estimated.notes.length;

  const precision = numEst > 0 ? numCorrect / numEst : 0;
  const recall = numRef > 0 ? numCorrect / numRef : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  // Calculate average overlap ratio for matched notes
  let avgOverlapRatio = 0;
  if (matchResult.matches.length > 0) {
    const overlapRatios = matchResult.matches.map((match) => {
      const refNote = reference.notes[match.ref];
      const estNote = estimated.notes[match.est];
      const refOn = refNote.time;
      const refOff = refNote.time + refNote.duration;
      const estOn = estNote.time;
      const estOff = estNote.time + estNote.duration;

      const intersection = Math.max(
        0,
        Math.min(refOff, estOff) - Math.max(refOn, estOn)
      );
      const union = Math.max(refOff, estOff) - Math.min(refOn, estOn);

      return union > 0 ? intersection / union : 0;
    });

    avgOverlapRatio =
      overlapRatios.reduce((sum, ratio) => sum + ratio, 0) /
      overlapRatios.length;
  }

  return {
    precision,
    recall,
    f1,
    f_measure: f1,
    avgOverlapRatio,
    numCorrect,
    numRef,
    numEst,
    matches: matchResult.matches,
    falseNegatives: matchResult.falseNegatives,
    falsePositives: matchResult.falsePositives,
  };
}

export function precision_recall_f1_overlap(
  reference: ParsedMidi,
  estimated: ParsedMidi,
  options: Partial<TranscriptionToleranceOptions> = {}
): {
  precision: number;
  recall: number;
  f1: number;
  f_measure: number;
  avgOverlapRatio: number;
} {
  const metrics = computeNoteMetrics(reference, estimated, options);
  return {
    precision: metrics.precision,
    recall: metrics.recall,
    f1: metrics.f1,
    f_measure: metrics.f_measure,
    avgOverlapRatio: metrics.avgOverlapRatio,
  };
}

/**
 * Compute velocity-aware metrics on top of note matching.
 *
 * Two modes are supported:
 * - 'threshold': a match is velocity-correct if |dv| <= tol (normalized or MIDI)
 * - 'weighted': per-pair score = max(0, 1 - |dv|/tol) averaged across matches
 *
 * By default, velocity is NOT used to determine matches (unique assignment is
 * computed using onset/pitch/offset only). Set `velocity.includeInMatching=true`
 * to add a velocity gate in the matching graph.
 */
export function computeVelocityMetrics(
  reference: ParsedMidi,
  estimated: ParsedMidi,
  options: Partial<TranscriptionToleranceOptions> = {},
  velocity: Partial<VelocityToleranceOptions> = {}
): NoteMetrics & {
  velocity: {
    mode: VelocityToleranceOptions["mode"]; 
    toleranceNormalized: number;
    toleranceMidi: number;
    numVelocityCorrect: number;
    accuracyOnMatches: number; // ratio among matched pairs
    weightedScoreOnMatches: number; // average in [0,1]
  };
} {
  const vopts = { ...DEFAULT_VELOCITY_OPTIONS, ...velocity };
  const tolNorm = vopts.unit === 'midi' ? vopts.velocityTolerance / 127 : vopts.velocityTolerance;
  const tolMidi = vopts.unit === 'midi' ? vopts.velocityTolerance : Math.round(vopts.velocityTolerance * 127);

  // Perform matching (optionally velocity-gated)
  const matchResult = matchNotesWithVelocity(reference, estimated, options, vopts);

  // Base note metrics
  const base = computeNoteMetrics(reference, estimated, options);

  // Compute velocity statistics over the matched pairs
  let numVelocityCorrect = 0;
  let weightedSum = 0;
  let denom = matchResult.matches.length;

  for (const m of matchResult.matches) {
    const dv = typeof m.velocityDiff === 'number' ? m.velocityDiff : 0;
    const dvNorm = dv; // already normalized in NoteData
    if (vopts.mode === 'threshold') {
      if (dvNorm <= tolNorm) numVelocityCorrect += 1;
      // threshold mode still contributes to weighted average as 0/1
      weightedSum += dvNorm <= tolNorm ? 1 : 0;
    } else {
      const score = Math.max(0, 1 - dvNorm / Math.max(1e-12, tolNorm));
      // Count as correct if score==1 (perfect) in this mode for numVelocityCorrect
      if (score >= 1 - 1e-9) numVelocityCorrect += 1;
      weightedSum += score;
    }
  }

  const accuracyOnMatches = denom > 0 ? numVelocityCorrect / denom : 0;
  const weightedScoreOnMatches = denom > 0 ? weightedSum / denom : 0;

  return {
    ...base,
    matches: matchResult.matches,
    falseNegatives: matchResult.falseNegatives,
    falsePositives: matchResult.falsePositives,
    velocity: {
      mode: vopts.mode,
      toleranceNormalized: tolNorm,
      toleranceMidi: tolMidi,
      numVelocityCorrect,
      accuracyOnMatches,
      weightedScoreOnMatches,
    },
  };
}

/**
 * Unified evaluation helper that returns both note-level PRF/overlap and
 * velocity-aware diagnostics suitable for visualization.
 */
export function evaluateTranscription(
  reference: ParsedMidi,
  estimated: ParsedMidi,
  options: Partial<TranscriptionToleranceOptions> = {},
  velocity: Partial<VelocityToleranceOptions> = {}
): ReturnType<typeof computeVelocityMetrics> {
  return computeVelocityMetrics(reference, estimated, options, velocity);
}

/**
 * mir_eval-style PRF: onset+pitch only.
 */
export function precision_recall_f1(
  reference_intervals: [number, number][],
  reference_pitches: number[],
  estimated_intervals: [number, number][],
  estimated_pitches: number[],
  onset_tolerance: number,
  pitch_tolerance: number
): { precision: number; recall: number; f1: number; f_measure: number } {
  const { matches } = match_notes(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches,
    onset_tolerance,
    pitch_tolerance
  );

  const numRef = reference_intervals.length;
  const numEst = estimated_intervals.length;
  const numCorrect = matches.length;
  const precision = numEst > 0 ? numCorrect / numEst : 0;
  const recall = numRef > 0 ? numCorrect / numRef : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;
  return { precision, recall, f1, f_measure: f1 };
}

/**
 * mir_eval-style PRF + average overlap ratio (onset+pitch+offset matching).
 */
export function precision_recall_f1_overlap_arrays(
  reference_intervals: [number, number][],
  reference_pitches: number[],
  estimated_intervals: [number, number][],
  estimated_pitches: number[],
  onset_tolerance: number,
  pitch_tolerance: number,
  offset_ratio_tolerance: number,
  offset_min_tolerance: number
): {
  precision: number;
  recall: number;
  f1: number;
  f_measure: number;
  avgOverlapRatio: number;
} {
  const { matches } = match_notes_with_offset(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches,
    onset_tolerance,
    pitch_tolerance,
    offset_ratio_tolerance,
    offset_min_tolerance
  );

  const numRef = reference_intervals.length;
  const numEst = estimated_intervals.length;
  const numCorrect = matches.length;
  const precision = numEst > 0 ? numCorrect / numEst : 0;
  const recall = numRef > 0 ? numCorrect / numRef : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  // Average overlap ratio (IoU) across matched pairs
  let avgOverlapRatio = 0;
  if (matches.length > 0) {
    let sum = 0;
    for (const m of matches) {
      const [refOn, refOff] = reference_intervals[m.ref];
      const [estOn, estOff] = estimated_intervals[m.est];
      const intersection = Math.max(
        0,
        Math.min(refOff, estOff) - Math.max(refOn, estOn)
      );
      const union = Math.max(refOff, estOff) - Math.min(refOn, estOn);
      sum += union > 0 ? intersection / union : 0;
    }
    avgOverlapRatio = sum / matches.length;
  }

  return { precision, recall, f1, f_measure: f1, avgOverlapRatio };
}

/**
 * Chroma PRF (onset+chroma pitch only).
 */
export function chroma_precision_recall_f1(
  reference_intervals: [number, number][],
  reference_pitches: number[],
  estimated_intervals: [number, number][],
  estimated_pitches: number[],
  onset_tolerance: number,
  pitch_tolerance: number
): { precision: number; recall: number; f1: number; f_measure: number } {
  const { matches } = match_notes_chroma_onset(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches,
    onset_tolerance,
    pitch_tolerance
  );

  const numRef = reference_intervals.length;
  const numEst = estimated_intervals.length;
  const numCorrect = matches.length;
  const precision = numEst > 0 ? numCorrect / numEst : 0;
  const recall = numRef > 0 ? numCorrect / numRef : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;
  return { precision, recall, f1, f_measure: f1 };
}

/**
 * Chroma PRF + overlap ratio (onset+chroma pitch+offset matching).
 */
export function chroma_precision_recall_f1_overlap(
  reference_intervals: [number, number][],
  reference_pitches: number[],
  estimated_intervals: [number, number][],
  estimated_pitches: number[],
  onset_tolerance: number,
  pitch_tolerance: number,
  offset_ratio_tolerance: number,
  offset_min_tolerance: number
): {
  precision: number;
  recall: number;
  f1: number;
  f_measure: number;
  avgOverlapRatio: number;
} {
  const { matches } = match_notes_chroma(
    reference_intervals,
    reference_pitches,
    estimated_intervals,
    estimated_pitches,
    onset_tolerance,
    pitch_tolerance,
    offset_ratio_tolerance,
    offset_min_tolerance
  );

  const numRef = reference_intervals.length;
  const numEst = estimated_intervals.length;
  const numCorrect = matches.length;
  const precision = numEst > 0 ? numCorrect / numEst : 0;
  const recall = numRef > 0 ? numCorrect / numRef : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  let avgOverlapRatio = 0;
  if (matches.length > 0) {
    let sum = 0;
    for (const m of matches) {
      const [refOn, refOff] = reference_intervals[m.ref];
      const [estOn, estOff] = estimated_intervals[m.est];
      const intersection = Math.max(
        0,
        Math.min(refOff, estOff) - Math.max(refOn, estOn)
      );
      const union = Math.max(refOff, estOff) - Math.min(refOn, estOn);
      sum += union > 0 ? intersection / union : 0;
    }
    avgOverlapRatio = sum / matches.length;
  }

  return { precision, recall, f1, f_measure: f1, avgOverlapRatio };
}
