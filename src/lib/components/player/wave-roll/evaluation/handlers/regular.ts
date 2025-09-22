import { mixColorsOklch, blendColorsAverage } from "@/lib/core/utils/color/blend";
import { GRAY_EVAL_INTERSECTION } from "@/lib/core/constants";
import { toNumberColor, NEUTRAL_GRAY, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO } from "../colors";

export interface RegularParams {
  isRef: boolean;
  isEst: boolean;
  coloredNote: any;
  note: any;
  sourceIdx: number;
  fileColor: number;
  nonIntersectColor: number;
  ownHighlightColor: number;
  useGrayGlobal: boolean;
  isExclusive: boolean;
  isExclusiveGlobal: boolean;
  isIntersectionOwn: boolean;
  state: any;
  evalState: any;
  estFiles: any[];
  byRef: Map<number, Array<{ estId: string; estIdx: number }>>;
  byEst: Map<string, Map<number, number>>;
  unionRangesByRef: Map<number, Array<{ start: number; end: number }>>;
  ambiguousByRef: Map<number, Array<{ start: number; end: number }>>;
  ambiguousByEst: Map<string, Map<number, Array<{ start: number; end: number }>>>;
  pushSegment: (start: number, end: number, color: number, flags?: { isEval?: boolean; kind?: "intersection" | "exclusive" | "ambiguous" }) => void;
  result: any[];
}

export function handleRegular(params: RegularParams): boolean {
  const {
    isRef,
    isEst,
    coloredNote,
    note,
    sourceIdx,
    fileColor,
    nonIntersectColor,
    ownHighlightColor,
    useGrayGlobal,
    isExclusive,
    isExclusiveGlobal,
    isIntersectionOwn,
    state,
    evalState,
    estFiles,
    byRef,
    byEst,
    unionRangesByRef,
    ambiguousByRef,
    ambiguousByEst,
    pushSegment,
    result,
  } = params;

  if (isRef) {
    const unionRanges = (unionRangesByRef.get(sourceIdx) || []).slice();
    const noteStart = note.time;
    const noteEnd = note.time + note.duration;
    const ambRanges = (ambiguousByRef.get(sourceIdx) || []).map(r => ({ start: r.start, end: r.end }));
    let pairIntersectColor = nonIntersectColor;
    if (useGrayGlobal) {
      pairIntersectColor = parseInt(GRAY_EVAL_INTERSECTION.replace("#", ""), 16);
    } else if (isExclusiveGlobal && isIntersectionOwn) {
      pairIntersectColor = mixColorsOklch(
        fileColor,
        HIGHLIGHT_ANCHOR_REF,
        HIGHLIGHT_BLEND_RATIO
      );
    } else if (estFiles.length >= 1 && byRef.has(sourceIdx)) {
      const pair = byRef.get(sourceIdx)![0];
      const estFile = estFiles.find((f: any) => f.id === pair.estId);
      if (estFile) {
        const estBase = toNumberColor(estFile.color ?? 0);
        const refOwn = mixColorsOklch(fileColor, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
        const estOwn = mixColorsOklch(estBase, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
        const blended = blendColorsAverage([refOwn, estOwn]);
        pairIntersectColor = mixColorsOklch(blended, 0xffffff, 0.20);
      }
    }

    if (unionRanges.length === 0) {
      // Defer ambiguous/no-match handling to the original caller block to ensure parity
      return false;
    }

    unionRanges.sort((a, b) => a.start - b.start);
    let cursor = noteStart;
    for (const r of unionRanges) {
      const s = Math.max(noteStart, r.start);
      const e = Math.min(noteEnd, r.end);
      if (s < noteEnd && e > noteStart && s < e) {
        if (cursor < s) {
          pushSegment(
            cursor,
            s,
            isExclusive ? ownHighlightColor : nonIntersectColor,
            isExclusive ? { isEval: true, kind: "exclusive" } : undefined
          );
        }
        pushSegment(
          Math.max(s, noteStart),
          Math.min(e, noteEnd),
          isExclusive ? nonIntersectColor : pairIntersectColor,
          !isExclusive ? { isEval: true, kind: "intersection" } : undefined
        );
        cursor = Math.max(cursor, e);
      }
    }
    if (cursor < noteEnd) {
      pushSegment(
        cursor,
        noteEnd,
        isExclusive ? ownHighlightColor : nonIntersectColor,
        isExclusive ? { isEval: true, kind: "exclusive" } : undefined
      );
    }
    return true;
  }

  if (isEst) {
    const refIdx = byEst.get(coloredNote.fileId)?.get(sourceIdx);
    if (refIdx === undefined) {
      // Fallback handled by caller for ambiguous coloring, we just say handled=false
      return false;
    }

    const refNote = state.files.find((f: any) => f.id === evalState.refId).parsedData.notes[refIdx];
    const refOn = refNote.time;
    const refOff = refNote.time + refNote.duration;
    const noteStart = note.time;
    const noteEnd = note.time + note.duration;
    const intersectStart = Math.max(refOn, noteStart);
    const intersectEnd = Math.min(refOff, noteEnd);

    let pairIntersectColor = nonIntersectColor;
    if (useGrayGlobal) {
      pairIntersectColor = parseInt(GRAY_EVAL_INTERSECTION.replace("#", ""), 16);
    } else if (isExclusiveGlobal && isIntersectionOwn) {
      pairIntersectColor = mixColorsOklch(
        fileColor,
        HIGHLIGHT_ANCHOR_EST,
        HIGHLIGHT_BLEND_RATIO
      );
    } else {
      const refBase = toNumberColor(
        state.files.find((f: any) => f.id === evalState.refId)?.color ?? 0
      );
      const estBase = fileColor;
      const refOwn = mixColorsOklch(refBase, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
      const estOwn = mixColorsOklch(estBase, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
      const blended = blendColorsAverage([refOwn, estOwn]);
      pairIntersectColor = mixColorsOklch(blended, 0xffffff, 0.20);
    }

    if (intersectStart < intersectEnd) {
      if (noteStart < intersectStart) {
        pushSegment(
          noteStart,
          intersectStart,
          isExclusive ? ownHighlightColor : nonIntersectColor,
          isExclusive ? { isEval: true, kind: "exclusive" } : undefined
        );
      }
      pushSegment(
        intersectStart,
        intersectEnd,
        isExclusive ? nonIntersectColor : pairIntersectColor,
        !isExclusive ? { isEval: true, kind: "intersection" } : undefined
      );
      if (intersectEnd < noteEnd) {
        pushSegment(
          intersectEnd,
          noteEnd,
          isExclusive ? ownHighlightColor : nonIntersectColor,
          isExclusive ? { isEval: true, kind: "exclusive" } : undefined
        );
      }
    } else {
      // no intersection (should not happen for matched)
      return false;
    }
    return true;
  }

  return false;
}


