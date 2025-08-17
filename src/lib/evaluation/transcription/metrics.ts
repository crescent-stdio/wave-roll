import {
  matchNotes,
  NoteMatchResult,
  match_notes,
  match_notes_with_offset,
  match_notes_chroma,
  match_notes_chroma_onset,
} from "./matchNotes";
import { ParsedMidi } from "@/lib/midi/types";
import { TranscriptionToleranceOptions } from "./constants";

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
