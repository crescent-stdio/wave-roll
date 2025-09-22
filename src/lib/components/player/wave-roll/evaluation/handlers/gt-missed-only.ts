import { mixColorsOklch, blendColorsAverage } from "@/lib/core/utils/color/blend";
import { COLOR_PRIMARY } from "@/lib/core/constants";
import { toNumberColor, aaGrayFor, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO } from "../colors";

export interface GtMissedOnlyParams {
  highlightMode: string;
  isRef: boolean;
  coloredNote: any;
  note: any;
  sourceIdx: number;
  fileColor: number;
  state: any;
  evalState: any;
  estFiles: any[];
  byRef: Map<number, Array<{ estId: string; estIdx: number }>>;
  unionRangesByRef: Map<number, Array<{ start: number; end: number }>>;
  result: any[];
}

export function handleGtMissedOnly(params: GtMissedOnlyParams): boolean {
  const {
    highlightMode,
    isRef,
    coloredNote,
    note,
    sourceIdx,
    fileColor,
    state,
    evalState,
    estFiles,
    byRef,
    unionRangesByRef,
    result,
  } = params;

  if (
    highlightMode !== "eval-gt-missed-only-own" &&
    highlightMode !== "eval-gt-missed-only-gray"
  ) {
    return false;
  }

  const refEntry = state.files.find((f: any) => f.id === evalState.refId);
  const refBaseColor = toNumberColor(refEntry?.color ?? COLOR_PRIMARY);
  const grayRef = aaGrayFor(refBaseColor);
  const useGrayForIntersection = highlightMode === "eval-gt-missed-only-gray";

  if (isRef) {
    const unionRanges = (unionRangesByRef.get(sourceIdx) || []).slice().sort((a,b)=>a.start-b.start);
    const noteStart = note.time;
    const noteEnd = note.time + note.duration;

    if (unionRanges.length === 0) {
      result.push({
        note: { ...note, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
        color: fileColor,
        fileId: coloredNote.fileId,
        isMuted: coloredNote.isMuted,
      });
      return true;
    }

    let cursor = noteStart;
    for (const r of unionRanges) {
      const s = Math.max(noteStart, r.start);
      const e = Math.min(noteEnd, r.end);
      if (s < noteEnd && e > noteStart && s < e) {
        if (cursor < s) {
          result.push({
            note: { ...note, time: cursor, duration: s - cursor, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
            color: fileColor,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        let interColor = grayRef;
        if (!useGrayForIntersection) {
          const pairs = byRef.get(sourceIdx);
          if (pairs && pairs.length > 0) {
            const estFile = estFiles.find((f: any) => f.id === pairs[0].estId);
            const estBase = estFile ? toNumberColor(estFile.color ?? COLOR_PRIMARY) : refBaseColor;
            const refOwn = mixColorsOklch(refBaseColor, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
            const estOwn = mixColorsOklch(estBase, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
            const blended = blendColorsAverage([refOwn, estOwn]);
            interColor = mixColorsOklch(blended, 0xffffff, 0.20);
          } else {
            interColor = mixColorsOklch(refBaseColor, 0xffffff, 0.15);
          }
        }
        result.push({
          note: { ...note, time: Math.max(s, noteStart), duration: Math.min(e, noteEnd) - Math.max(s, noteStart), isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
          color: interColor,
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
        cursor = Math.max(cursor, e);
      }
    }
    if (cursor < noteEnd) {
      result.push({
        note: { ...note, time: cursor, duration: noteEnd - cursor, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
        color: fileColor,
        fileId: coloredNote.fileId,
        isMuted: coloredNote.isMuted,
      });
    }
  } else {
    result.push({
      note: { ...note, noOverlay: true, isEvalHighlightSegment: false },
      color: grayRef,
      fileId: coloredNote.fileId,
      isMuted: coloredNote.isMuted,
    });
  }

  return true;
}


