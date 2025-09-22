import type { NoteMatchResult } from "@/lib/evaluation/transcription/matchNotes";

export interface ExportOptions {
  pretty?: boolean;
}

export function exportMatchResult(
  result: NoteMatchResult,
  options: ExportOptions = {}
): string {
  return JSON.stringify(result, null, options.pretty ? 2 : 0);
}

export function exportPairsCSV(result: NoteMatchResult): string {
  const header = ["refIndex", "estIndex", "refPitch", "estPitch", "refTime", "estTime"].join(",");
  const rows = result.matches.map((m) => [m.ref, m.est, m.refPitch, m.estPitch, m.refTime, m.estTime].join(","));
  return [header, ...rows].join("\n");
}


