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
  const EPS = 1e-9;
  const clampEdge = (x: number, a: number, b: number): number => {
    if (Math.abs(x - a) <= EPS) return a;
    if (Math.abs(x - b) <= EPS) return b;
    return x;
  };
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
        // No TP: show as Not-TP using mapping
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
        const s = clampEdge(Math.max(noteStart, r.start), noteStart, noteEnd);
        const e = clampEdge(Math.min(noteEnd, r.end), noteStart, noteEnd);
        if (cursor + EPS < s) {
          // Non-TP segment according to mode mapping
          result.push({
            note: { ...note, time: cursor, duration: s - cursor, isEvalHighlightSegment: false },
            color: getNonSelectedColor(true),
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        if (s + EPS < e) {
          result.push({
            note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
            color: pairColor,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        cursor = Math.max(cursor, e);
        // Snap cursor to edges to avoid residuals
        if (Math.abs(cursor - noteEnd) <= EPS) cursor = noteEnd;
        if (Math.abs(cursor - noteStart) <= EPS) cursor = noteStart;
      }
      if (cursor + EPS < noteEnd) {
        // Trailing non-TP
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
      // Align with description for -gray: Mute FN, keep others normal
      // - In -gray (useGrayGlobal=true): exclusive (FN) uses gray, intersections use normal ref color
      // - In -own (useGrayGlobal=false): keep previous behavior (exclusive highlighted by ref color, intersections dimmed)
      const exclusiveColor = useGrayGlobal ? selectedGrayColor : refBase;
      const interNonSelectedColor = useGrayGlobal ? refBase : dimGrayColor;
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
        const s = clampEdge(Math.max(noteStart, r.start), noteStart, noteEnd);
        const e = clampEdge(Math.min(noteEnd, r.end), noteStart, noteEnd);
        if (cursor + EPS < s) {
          result.push({
            note: { ...note, time: cursor, duration: s - cursor, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
            color: exclusiveColor,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        if (s + EPS < e) {
          result.push({
            note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
            color: useGrayGlobal ? getNonSelectedColor(true, true) : interNonSelectedColor,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        cursor = Math.max(cursor, e);
        if (Math.abs(cursor - noteEnd) <= EPS) cursor = noteEnd;
        if (Math.abs(cursor - noteStart) <= EPS) cursor = noteStart;
      }
      if (cursor + EPS < noteEnd) {
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
      const unionRanges = (unionRangesByRef.get(sourceIdx) || []).slice().sort((a, b) => a.start - b.start);
      const noteStart = note.time;
      const noteEnd = note.time + note.duration;
      if (unionRanges.length === 0) {
        // Entire REF note is non-FP
        result.push({
          note: { ...note, isEvalHighlightSegment: false },
          color: getNonSelectedColor(true),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
        return true;
      }
      let cursor = noteStart;
      for (const r of unionRanges) {
        const s = clampEdge(Math.max(noteStart, r.start), noteStart, noteEnd);
        const e = clampEdge(Math.min(noteEnd, r.end), noteStart, noteEnd);
        if (cursor + EPS < s) {
          // REF-only portion (non-FP)
          result.push({
            note: { ...note, time: cursor, duration: s - cursor, isEvalHighlightSegment: false },
            color: getNonSelectedColor(true),
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        if (s + EPS < e) {
          // Matched overlap shown according to mapping
          result.push({
            note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: false },
            color: getNonSelectedColor(true, true),
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        cursor = Math.max(cursor, e);
        if (Math.abs(cursor - noteEnd) <= EPS) cursor = noteEnd;
        if (Math.abs(cursor - noteStart) <= EPS) cursor = noteStart;
      }
      if (cursor + EPS < noteEnd) {
        result.push({
          note: { ...note, time: cursor, duration: noteEnd - cursor, isEvalHighlightSegment: false },
          color: getNonSelectedColor(true),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      return true;
    }
  }

  if (isEst) {
    const refIdx = byEst.get(coloredNote.fileId)?.get(sourceIdx);
    const estBase = fileColor;

    if (isTpOnly) {
      if (refIdx === undefined) {
        // Geometry fallback: if there is an overlap with any REF note of same pitch,
        // split into (non-TP -> Not-TP color) + (overlap -> TP intersection color)
        const refFile = state.files.find((f: any) => f.id === evalState.refId);
        const refNotes = refFile?.parsedData?.notes || [];
        const noteStart = note.time;
        const noteEnd = note.time + note.duration;
        const overlaps: Array<{ start: number; end: number }> = [];
        for (const rn of refNotes) {
          if (rn?.midi !== note.midi) continue;
          const s = clampEdge(Math.max(rn.time, noteStart), noteStart, noteEnd);
          const e = clampEdge(Math.min(rn.time + rn.duration, noteEnd), noteStart, noteEnd);
          if (s + EPS < e) overlaps.push({ start: s, end: e });
        }
        overlaps.sort((a, b) => a.start - b.start);
        if (overlaps.length === 0) {
          // No geometric overlap: Not-TP
          result.push({
            note: { ...note, isEvalHighlightSegment: false },
            color: getNonSelectedColor(false),
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
          return true;
        }
        // Merge simple overlaps (assume already sorted, minimal overlap)
        let cursor = noteStart;
        const refBase = toNumberColor(refFile?.color ?? COLOR_PRIMARY);
        const pairColor = computePairIntersectColor(refBase, estBase);
        for (const r of overlaps) {
          const s = r.start;
          const e = r.end;
          if (cursor + EPS < s) {
            result.push({
              note: { ...note, time: cursor, duration: s - cursor, isEvalHighlightSegment: false },
              color: getNonSelectedColor(false),
              fileId: coloredNote.fileId,
              isMuted: coloredNote.isMuted,
            });
          }
          result.push({
            note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
            color: pairColor,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
          cursor = Math.max(cursor, e);
        }
        if (cursor + EPS < noteEnd) {
          result.push({
            note: { ...note, time: cursor, duration: noteEnd - cursor, isEvalHighlightSegment: false },
            color: getNonSelectedColor(false),
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        return true;
      }
      const refNote = state.files.find((f: any) => f.id === evalState.refId) ?
        state.files.find((f: any) => f.id === evalState.refId).parsedData.notes[refIdx] : null;
      const noteStart = note.time;
      const noteEnd = note.time + note.duration;
      const s = clampEdge(Math.max(refNote.time, noteStart), noteStart, noteEnd);
      const e = clampEdge(Math.min(refNote.time + refNote.duration, noteEnd), noteStart, noteEnd);

      if (noteStart + EPS < s) {
        result.push({
          note: { ...note, time: noteStart, duration: s - noteStart, isEvalHighlightSegment: false },
          color: getNonSelectedColor(false),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      if (s + EPS < e) {
        const refBase = toNumberColor(state.files.find((f: any) => f.id === evalState.refId)?.color ?? COLOR_PRIMARY);
        const pairColor = computePairIntersectColor(refBase, estBase);
        result.push({
          note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
          color: pairColor,
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      if (e + EPS < noteEnd) {
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
      const exclusiveColor = useGrayGlobal ? selectedGrayColor : estBase; // for unmatched FP
      if (refIdx === undefined) {
        // Geometry fallback against REF to split overlaps as non-FP intersections
        const refFile = state.files.find((f: any) => f.id === evalState.refId);
        const refNotes = refFile?.parsedData?.notes || [];
        const noteStart = note.time;
        const noteEnd = note.time + note.duration;
        const overlaps: Array<{ start: number; end: number }> = [];
        for (const rn of refNotes) {
          if (rn?.midi !== note.midi) continue;
          const s = clampEdge(Math.max(rn.time, noteStart), noteStart, noteEnd);
          const e = clampEdge(Math.min(rn.time + rn.duration, noteEnd), noteStart, noteEnd);
          if (s + EPS < e) overlaps.push({ start: s, end: e });
        }
        overlaps.sort((a, b) => a.start - b.start);
        if (overlaps.length === 0) {
          // Pure FP: whole note highlighted as FP exclusive
          result.push({
            note: { ...note, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
            color: exclusiveColor,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
          return true;
        }
        // Split: FP exclusive outside, intersection as non-FP (with intersection highlight color mapping)
        let cursor = noteStart;
        for (const r of overlaps) {
          const s = r.start;
          const e = r.end;
          if (cursor + EPS < s) {
            result.push({
              note: { ...note, time: cursor, duration: s - cursor, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
              color: exclusiveColor,
              fileId: coloredNote.fileId,
              isMuted: coloredNote.isMuted,
            });
          }
          // Intersection segment
          result.push({
            note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
            color: getNonSelectedColor(false, true),
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
          cursor = Math.max(cursor, e);
        }
        if (cursor + EPS < noteEnd) {
          result.push({
            note: { ...note, time: cursor, duration: noteEnd - cursor, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
            color: exclusiveColor,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        return true;
      }
      // Matched EST note is non-FP: color by mapping with intersection highlight
      const refNote = state.files.find((f: any) => f.id === evalState.refId).parsedData.notes[refIdx];
      const noteStart = note.time;
      const noteEnd = note.time + note.duration;
      const s = clampEdge(Math.max(refNote.time, noteStart), noteStart, noteEnd);
      const e = clampEdge(Math.min(refNote.time + refNote.duration, noteEnd), noteStart, noteEnd);

      if (noteStart + EPS < s) {
        result.push({
          note: { ...note, time: noteStart, duration: s - noteStart, isEvalHighlightSegment: false },
          color: getNonSelectedColor(false),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      if (s + EPS < e) {
        result.push({
          note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
          color: getNonSelectedColor(false, true),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      if (e + EPS < noteEnd) {
        result.push({
          note: { ...note, time: e, duration: noteEnd - e, isEvalHighlightSegment: false },
          color: getNonSelectedColor(false),
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      return true;
    }

    if (isFnOnly) {
      // For eval-fn-only-gray: highlight intersections, keep non-overlap normal
      if (useGrayGlobal) {
        const refFile = state.files.find((f: any) => f.id === evalState.refId);
        const refNotes = refFile?.parsedData?.notes || [];
        const noteStart = note.time;
        const noteEnd = note.time + note.duration;
        const overlaps: Array<{ start: number; end: number }> = [];
        for (const rn of refNotes) {
          if (rn?.midi !== note.midi) continue;
          const s = clampEdge(Math.max(rn.time, noteStart), noteStart, noteEnd);
          const e = clampEdge(Math.min(rn.time + rn.duration, noteEnd), noteStart, noteEnd);
          if (s + EPS < e) overlaps.push({ start: s, end: e });
        }
        overlaps.sort((a, b) => a.start - b.start);
        if (overlaps.length === 0) {
          // No intersection with REF: keep entire EST note normal
          result.push({
            note: { ...note, isEvalHighlightSegment: false },
            color: estBase,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
          return true;
        }
        let cursor = noteStart;
        for (const r of overlaps) {
          const s = r.start;
          const e = r.end;
          if (cursor + EPS < s) {
            result.push({
              note: { ...note, time: cursor, duration: s - cursor, isEvalHighlightSegment: false },
              color: estBase,
              fileId: coloredNote.fileId,
              isMuted: coloredNote.isMuted,
            });
          }
          result.push({
            note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
            color: getNonSelectedColor(false, true),
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
          cursor = Math.max(cursor, e);
        }
        if (cursor + EPS < noteEnd) {
          result.push({
            note: { ...note, time: cursor, duration: noteEnd - cursor, isEvalHighlightSegment: false },
            color: estBase,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        return true;
      }
      // For -own: suppress EST notes (FN-only means REF focus)
      return true;
    }
  }

  return false;
}


