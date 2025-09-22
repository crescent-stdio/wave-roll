import type { ParsedMidi } from "@/lib/midi/types";
import type { NoteMatchResult } from "@/lib/evaluation/transcription/matchNotes";

export interface MatchVisualization {
  pairs: Array<{
    refIndex: number;
    estIndex: number;
    ref: { time: number; duration: number; midi: number };
    est: { time: number; duration: number; midi: number };
    intersection: { start: number; end: number; duration: number } | null;
  }>;
  falseNegatives: number[];
  falsePositives: number[];
}

export function buildMatchVisualization(
  reference: ParsedMidi,
  estimated: ParsedMidi,
  match: NoteMatchResult
): MatchVisualization {
  const pairs = match.matches.map((m) => {
    const r = reference.notes[m.ref];
    const e = estimated.notes[m.est];
    const start = Math.max(r.time, e.time);
    const end = Math.min(r.time + r.duration, e.time + e.duration);
    const intersection = end > start ? { start, end, duration: end - start } : null;
    return {
      refIndex: m.ref,
      estIndex: m.est,
      ref: { time: r.time, duration: r.duration, midi: r.midi },
      est: { time: e.time, duration: e.duration, midi: e.midi },
      intersection,
    };
  });
  return {
    pairs,
    falseNegatives: match.falseNegatives.slice(),
    falsePositives: match.falsePositives.slice(),
  };
}


