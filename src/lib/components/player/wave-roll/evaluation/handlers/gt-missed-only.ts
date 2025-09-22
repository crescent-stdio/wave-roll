import { mixColorsOklch, blendColorsAverage } from "@/lib/core/utils/color/blend";
import { COLOR_PRIMARY } from "@/lib/core/constants";
import { toNumberColor, aaGrayFor, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO } from "../colors";
import { mergeRanges } from "../ranges";

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
  const exclusiveColorRef = useGrayForIntersection ? refBaseColor : grayRef;

  if (isRef) {
    const unionRanges = (unionRangesByRef.get(sourceIdx) || []).slice().sort((a,b)=>a.start-b.start);
    const noteStart = note.time;
    const noteEnd = note.time + note.duration;

    if (unionRanges.length === 0) {
      result.push({
        note: { ...note, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
        color: exclusiveColorRef,
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
            color: exclusiveColorRef,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        const segStart = Math.max(s, noteStart);
        const segEnd = Math.min(noteEnd, e);
        let interColor = grayRef;
        if (!useGrayForIntersection) {
          let estBase: number | null = null;
          const pairs = byRef.get(sourceIdx);
          if (pairs && pairs.length > 0) {
            const estFile = estFiles.find((f: any) => f.id === pairs[0].estId);
            estBase = estFile ? toNumberColor(estFile.color ?? COLOR_PRIMARY) : refBaseColor;
          } else {
            // Geometry fallback: pick any overlapping est note (same pitch) for blend
            outer: for (const ef of estFiles) {
              const notes = ef.parsedData?.notes || [];
              for (let j = 0; j < notes.length; j++) {
                const en = notes[j];
                if (en?.midi !== note.midi) continue;
                const on = en.time, off = en.time + en.duration;
                if (on < segEnd && off > segStart) {
                  estBase = toNumberColor(ef.color ?? COLOR_PRIMARY);
                  break outer;
                }
              }
            }
          }
          if (estBase != null) {
            const refOwn = mixColorsOklch(refBaseColor, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
            const estOwn = mixColorsOklch(estBase, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
            const blended = blendColorsAverage([refOwn, estOwn]);
            interColor = mixColorsOklch(blended, 0xffffff, 0.20);
          } else {
            interColor = mixColorsOklch(refBaseColor, 0xffffff, 0.15);
          }
        }
        result.push({
          note: { ...note, time: segStart, duration: segEnd - segStart, isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
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
        color: exclusiveColorRef,
        fileId: coloredNote.fileId,
        isMuted: coloredNote.isMuted,
      });
    }
  } else {
    // Comparison track: split into exclusive and intersection using geometry vs REF
    const refNotes = refEntry?.parsedData?.notes || [];
    const noteStart = note.time;
    const noteEnd = note.time + note.duration;

    const overlaps: Array<{ start: number; end: number }> = [];
    for (const rn of refNotes) {
      if (rn?.midi !== note.midi) continue;
      const s = Math.max(noteStart, rn.time);
      const e = Math.min(noteEnd, rn.time + rn.duration);
      if (e > s) overlaps.push({ start: s, end: e });
    }
    const merged = mergeRanges(overlaps);

    const exclusiveColorComp = grayRef; // keep comparison dimmed in both variants

    if (merged.length === 0) {
      result.push({
        note: { ...note, noOverlay: true, isEvalHighlightSegment: false },
        color: exclusiveColorComp,
        fileId: coloredNote.fileId,
        isMuted: coloredNote.isMuted,
      });
      return true;
    }

    let cursor = noteStart;
    for (const r of merged) {
      const s = Math.max(noteStart, r.start);
      const e = Math.min(noteEnd, r.end);
      if (cursor < s) {
        result.push({
          note: { ...note, time: cursor, duration: s - cursor, isEvalHighlightSegment: false },
          color: exclusiveColorComp,
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      if (s < e) {
        // Intersection color: gray for -gray variant, blended for -own
        let interColor = grayRef;
        if (!useGrayForIntersection) {
          const compBase = fileColor;
          const refBase = refBaseColor;
          const refOwn = mixColorsOklch(refBase, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
          const estOwn = mixColorsOklch(compBase, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
          const blended = blendColorsAverage([refOwn, estOwn]);
          interColor = mixColorsOklch(blended, 0xffffff, 0.20);
        }
        result.push({
          note: { ...note, time: s, duration: e - s, isEvalHighlightSegment: true, evalSegmentKind: "intersection" },
          color: interColor,
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      }
      cursor = Math.max(cursor, e);
    }
    if (cursor < noteEnd) {
      result.push({
        note: { ...note, time: cursor, duration: noteEnd - cursor, isEvalHighlightSegment: false },
        color: exclusiveColorComp,
        fileId: coloredNote.fileId,
        isMuted: coloredNote.isMuted,
      });
    }
  }

  return true;
}


