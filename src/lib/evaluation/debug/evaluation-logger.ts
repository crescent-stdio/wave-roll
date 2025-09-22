import type { ParsedMidi } from "@/lib/midi/types";
import type { NoteMatchResult } from "@/lib/evaluation/transcription/matchNotes";

export interface EvaluationLogEntry {
  timestamp: string;
  refId: string;
  estId: string;
  tolerances: Record<string, unknown>;
  matches: number;
  falseNegatives: number;
  falsePositives: number;
}

export class EvaluationLogger {
  private entries: EvaluationLogEntry[] = [];

  public log(
    refId: string,
    estId: string,
    tolerances: Record<string, unknown>,
    result: NoteMatchResult
  ): void {
    this.entries.push({
      timestamp: new Date().toISOString(),
      refId,
      estId,
      tolerances,
      matches: result.matches.length,
      falseNegatives: result.falseNegatives.length,
      falsePositives: result.falsePositives.length,
    });
  }

  public getEntries(): EvaluationLogEntry[] {
    return this.entries.slice();
  }

  public clear(): void {
    this.entries = [];
  }
}

export const evaluationLogger = new EvaluationLogger();


