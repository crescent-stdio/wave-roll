import { matchNotes, NoteMatchResult } from "./matchNotes";
import { ParsedMidi } from "@/lib/midi/types";
import { TranscriptionToleranceOptions } from "./constants";

export interface NoteMetrics {
  precision: number;
  recall: number;
  f1: number;
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

  console.log("matchResult.matches", matchResult.matches);

  const numCorrect = matchResult.matches.length;
  const numRef = reference.notes.length;
  const numEst = estimated.notes.length;

  const precision = numEst > 0 ? numCorrect / numEst : 0;
  const recall = numRef > 0 ? numCorrect / numRef : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  return {
    precision,
    recall,
    f1,
    numCorrect,
    numRef,
    numEst,
    matches: matchResult.matches,
  };
}
