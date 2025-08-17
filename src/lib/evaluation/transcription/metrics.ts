import { matchNotes, NoteMatchResult } from "./matchNotes";
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
    const overlapRatios = matchResult.matches.map(match => {
      const refNote = reference.notes[match.ref];
      const estNote = estimated.notes[match.est];
      const refOn = refNote.time;
      const refOff = refNote.time + refNote.duration;
      const estOn = estNote.time;
      const estOff = estNote.time + estNote.duration;
      
      const intersection = Math.max(0, Math.min(refOff, estOff) - Math.max(refOn, estOn));
      const union = Math.max(refOff, estOff) - Math.min(refOn, estOn);
      
      return union > 0 ? intersection / union : 0;
    });
    
    avgOverlapRatio = overlapRatios.reduce((sum, ratio) => sum + ratio, 0) / overlapRatios.length;
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
