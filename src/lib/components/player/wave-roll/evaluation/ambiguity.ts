import { Range } from "./ranges";

export interface Ambiguities {
  ambiguousByRef: Map<number, Array<{ start: number; end: number; estId: string; estIdx: number }>>;
  ambiguousByEst: Map<string, Map<number, Array<{ start: number; end: number; refIdx: number }>>>;
}

export function buildAmbiguities(
  refFile: any,
  estFiles: any[],
  byRef: Map<number, Array<{ estId: string; estIdx: number }>>,
  byEst: Map<string, Map<number, number>>,
  tolerances: any
): Ambiguities {
  const matchedRef = new Set<number>([...byRef.keys()]);
  const ambiguousByRef = new Map<number, Array<{ start: number; end: number; estId: string; estIdx: number }>>();
  const ambiguousByEst = new Map<string, Map<number, Array<{ start: number; end: number; refIdx: number }>>>();

  const unmatchedEstIdxs = new Map<string, Set<number>>();
  for (const estFile of estFiles) {
    const estId = estFile.id;
    const estMap = byEst.get(estId) ?? new Map<number, number>();
    const s = new Set<number>();
    for (let i = 0; i < estFile.parsedData.notes.length; i++) {
      if (!estMap.has(i)) s.add(i);
    }
    unmatchedEstIdxs.set(estId, s);
    ambiguousByEst.set(estId, new Map());
  }

  for (let r = 0; r < refFile.parsedData.notes.length; r++) {
    if (matchedRef.has(r)) continue;
    const rn = refFile.parsedData.notes[r];
    const rOn = rn.time; const rOff = rn.time + rn.duration;
    for (const estFile of estFiles) {
      const estId = estFile.id;
      const uSet = unmatchedEstIdxs.get(estId)!;
      for (const eIdx of uSet) {
        const en = estFile.parsedData.notes[eIdx];
        if (en.midi !== rn.midi) continue;
        const eOn = en.time; const eOff = en.time + en.duration;
        const s = Math.max(rOn, eOn);
        const e = Math.min(rOff, eOff);
        if (e <= s) continue;
        const inter = Math.max(0, Math.min(rOff, eOff) - Math.max(rOn, eOn));
        const union = Math.max(rOff, eOff) - Math.min(rOn, eOn);
        const iou = union > 0 ? inter / union : 0;
        const onsetDiff = Math.abs(eOn - rOn);
        const refDur = rOff - rOn;
        const effOffsetTol = Math.max(
          tolerances.offsetMinTolerance,
          tolerances.offsetRatioTolerance * Math.max(0, refDur)
        );
        const offsetDiff = Math.abs(eOff - rOff);
        const nearOnset = onsetDiff <= tolerances.onsetTolerance * 1.25;
        const nearOffset = offsetDiff <= effOffsetTol * 1.25;
        if (iou >= 0.25 && (nearOnset || nearOffset)) {
          const listR = ambiguousByRef.get(r) ?? [];
          listR.push({ start: s, end: e, estId, estIdx: eIdx });
          ambiguousByRef.set(r, listR);
          const estMap = ambiguousByEst.get(estId)!;
          const listE = estMap.get(eIdx) ?? [];
          listE.push({ start: s, end: e, refIdx: r });
          estMap.set(eIdx, listE);
        }
      }
    }
  }

  return { ambiguousByRef, ambiguousByEst };
}


