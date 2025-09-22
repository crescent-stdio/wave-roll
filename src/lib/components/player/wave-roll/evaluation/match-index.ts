import { mergeRanges, Range } from "./ranges";
import { matchNotes } from "@/lib/evaluation/transcription";

export interface MatchIndexes {
  byRef: Map<number, Array<{ estId: string; estIdx: number }>>;
  byEst: Map<string, Map<number, number>>;
}

export function buildMatchIndex(refFile: any, estFiles: any[], tolerances: any): MatchIndexes {
  const byRef = new Map<number, Array<{ estId: string; estIdx: number }>>();
  const byEst = new Map<string, Map<number, number>>();

  for (const estFile of estFiles) {
    const estId: string = estFile.id;
    const matchResult = matchNotes(
      refFile.parsedData,
      estFile.parsedData,
      tolerances
    );
    if (!byEst.has(estId)) byEst.set(estId, new Map<number, number>());
    const estMap = byEst.get(estId)!;
    matchResult.matches.forEach((m) => {
      if (!byRef.has(m.ref)) byRef.set(m.ref, []);
      byRef.get(m.ref)!.push({ estId, estIdx: m.est });
      estMap.set(m.est, m.ref);
    });
  }

  return { byRef, byEst };
}

export function buildUnionRangesByRef(
  byRef: MatchIndexes["byRef"],
  refFile: any,
  estFiles: any[]
): Map<number, Range[]> {
  const unionRangesByRef = new Map<number, Range[]>();
  byRef.forEach((arr, refIdx) => {
    const refNote = refFile.parsedData.notes[refIdx];
    const refOn = refNote.time;
    const refOff = refNote.time + refNote.duration;
    const ranges: Range[] = [];
    for (const { estId, estIdx } of arr) {
      const estFile = estFiles.find((f: any) => f.id === estId);
      if (!estFile) continue;
      const estNote = estFile.parsedData.notes[estIdx];
      const estOn = estNote.time;
      const estOff = estNote.time + estNote.duration;
      const s = Math.max(refOn, estOn);
      const e = Math.min(refOff, estOff);
      if (e > s) {
        ranges.push({ start: s, end: e });
      }
    }
    unionRangesByRef.set(refIdx, mergeRanges(ranges));
  });
  return unionRangesByRef;
}


