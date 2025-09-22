import { mixColorsOklch, blendColorsAverage } from "@/lib/core/utils/color/blend";
import { COLOR_PRIMARY } from "@/lib/core/constants";
import { toNumberColor, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO } from "../colors";

export interface OnlyModesParams {
  isOnlyMode: boolean;
  isTpOnly: boolean;
  isFpOnly: boolean;
  isFnOnly: boolean;
  useGrayGlobal: boolean;
  isRef: boolean;
  isEst: boolean;
  fileColor: number;
  coloredNote: any;
  note: any;
  sourceIdx: number;
  state: any;
  evalState: any;
  estFiles: any[];
  byRef: Map<number, Array<{ estId: string; estIdx: number }>>;
  byEst: Map<string, Map<number, number>>;
  unionRangesByRef: Map<number, Array<{ start: number; end: number }>>;
  result: any[];
}

export function handleOnlyModes(params: OnlyModesParams): boolean {
  const {
    isOnlyMode,
    isTpOnly,
    isFpOnly,
    isFnOnly,
    useGrayGlobal,
    isRef,
    isEst,
    fileColor,
    coloredNote,
    note,
    sourceIdx,
    state,
    evalState,
    estFiles,
    byRef,
    byEst,
    unionRangesByRef,
    result,
  } = params;

  if (!isOnlyMode) return false;

  const dimGrayColor = 0x888888;
  const selectedGrayColor = 0x555555;

  const computePairIntersectColor = (refBase: number, estBase: number): number => {
    if (useGrayGlobal) {
      return selectedGrayColor;
    }
    const refOwn = mixColorsOklch(refBase, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
    const estOwn = mixColorsOklch(estBase, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
    const blended = blendColorsAverage([refOwn, estOwn]);
    return mixColorsOklch(blended, 0xffffff, 0.20);
  };

  const getNonSelectedColor = (forRef: boolean, forIntersection: boolean = false): number => {
    if (useGrayGlobal) {
      if (forIntersection) {
        const refBase = toNumberColor(state.files.find((f: any) => f.id === evalState.refId)?.color ?? COLOR_PRIMARY);
        const estBase = forRef ? fileColor : toNumberColor(state.files.find((f: any) => f.id === evalState.refId)?.color ?? COLOR_PRIMARY);
        const refOwn = mixColorsOklch(refBase, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
        const estOwn = mixColorsOklch(estBase, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
        const blended = blendColorsAverage([refOwn, estOwn]);
        return mixColorsOklch(blended, 0xffffff, 0.20);
      }
      return fileColor;
    }
    return dimGrayColor;
  };

  if (isRef) {
    const unionRanges = (unionRangesByRef.get(sourceIdx) || []).slice();
    const noteStart = note.time;
    const noteEnd = note.time + note.duration;
    const refBase = fileColor;

    if (isTpOnly) {
      if (unionRanges.length === 0) {
        result.push({
          note: { ...note, isEvalHighlightSegment: false },
          color: getNonSelectedColor(true),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
        return true;
      }
      let estBaseForBlend = refBase;
      const pairs = byRef.get(sourceIdx);
      if (pairs && pairs.length > 0) {
        const estFile = estFiles.find((f: any) => f.id === pairs[0].estId);
        if (estFile) estBaseForBlend = toNumberColor(estFile.color ?? COLOR_PRIMARY);
      }
      const pairColor = computePairIntersectColor(refBase, estBaseForBlend);
      unionRanges.sort((a, b) => a.start - b.start);
      let cursor = noteStart;
      for (const r of unionRanges) {
        const s = Math.max(noteStart, r.start);
        const e = Math.min(noteEnd, r.end);
        if (cursor < s) {
          result.push({
            note: { ...note, time: cursor, duration: s - cursor, isEvalHighlightSegment: false },
            color: getNonSelectedColor(true),
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        if (s < e) {
          result.push({
            note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
            color: pairColor,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        cursor = Math.max(cursor, e);
      }
      if (cursor < noteEnd) {
        result.push({
          note: { ...note, time: cursor, duration: noteEnd - cursor, isEvalHighlightSegment: false },
          color: getNonSelectedColor(true),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      return true;
    }

    if (isFnOnly) {
      const exclusiveColor = useGrayGlobal ? selectedGrayColor : refBase;
      if (unionRanges.length === 0) {
        result.push({
          note: { ...note, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
          color: exclusiveColor,
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
        return true;
      }
      let cursor = noteStart;
      unionRanges.sort((a, b) => a.start - b.start);
      for (const r of unionRanges) {
        const s = Math.max(noteStart, r.start);
        const e = Math.min(noteEnd, r.end);
        if (cursor < s) {
          result.push({
            note: { ...note, time: cursor, duration: s - cursor, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
            color: exclusiveColor,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        if (s < e) {
          result.push({
            note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: false },
            color: getNonSelectedColor(true, true),
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        cursor = Math.max(cursor, e);
      }
      if (cursor < noteEnd) {
        result.push({
          note: { ...note, time: cursor, duration: noteEnd - cursor, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
          color: exclusiveColor,
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      return true;
    }

    if (isFpOnly) {
      result.push({
        note: { ...note, isEvalHighlightSegment: false },
        color: getNonSelectedColor(true),
        fileId: coloredNote.fileId,
        isMuted: coloredNote.isMuted,
      });
      return true;
    }
  }

  if (isEst) {
    const refIdx = byEst.get(coloredNote.fileId)?.get(sourceIdx);
    const estBase = fileColor;

    if (isTpOnly) {
      if (refIdx === undefined) {
        result.push({
          note: { ...note, isEvalHighlightSegment: false },
          color: getNonSelectedColor(false),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
        return true;
      }
      const refNote = state.files.find((f: any) => f.id === evalState.refId) ?
        state.files.find((f: any) => f.id === evalState.refId).parsedData.notes[refIdx] : null;
      const noteStart = note.time;
      const noteEnd = note.time + note.duration;
      const s = Math.max(refNote.time, noteStart);
      const e = Math.min(refNote.time + refNote.duration, noteEnd);

      if (noteStart < s) {
        result.push({
          note: { ...note, time: noteStart, duration: s - noteStart, isEvalHighlightSegment: false },
          color: getNonSelectedColor(false),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      if (s < e) {
        const refBase = toNumberColor(state.files.find((f: any) => f.id === evalState.refId)?.color ?? COLOR_PRIMARY);
        const pairColor = computePairIntersectColor(refBase, estBase);
        result.push({
          note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
          color: pairColor,
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      if (e < noteEnd) {
        result.push({
          note: { ...note, time: e, duration: noteEnd - e, isEvalHighlightSegment: false },
          color: getNonSelectedColor(false),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      return true;
    }

    if (isFpOnly) {
      const exclusiveColor = useGrayGlobal ? selectedGrayColor : estBase;
      if (refIdx === undefined) {
        result.push({
          note: { ...note, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
          color: exclusiveColor,
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
        return true;
      }
      const refNote = state.files.find((f: any) => f.id === evalState.refId).parsedData.notes[refIdx];
      const noteStart = note.time;
      const noteEnd = note.time + note.duration;
      const s = Math.max(refNote.time, noteStart);
      const e = Math.min(refNote.time + refNote.duration, noteEnd);

      if (noteStart < s) {
        result.push({
          note: { ...note, time: noteStart, duration: s - noteStart, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
          color: exclusiveColor,
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      if (s < e) {
        result.push({
          note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: false },
          color: getNonSelectedColor(false, true),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      if (e < noteEnd) {
        result.push({
          note: { ...note, time: e, duration: noteEnd - e, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
          color: exclusiveColor,
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      return true;
    }

    if (isFnOnly) {
      result.push({
        note: { ...note, isEvalHighlightSegment: false },
        color: getNonSelectedColor(false),
        fileId: coloredNote.fileId,
        isMuted: coloredNote.isMuted,
      });
      return true;
    }
  }

  return false;
}


