import { ColoredNote } from "@/core/visualization";
import { StateManager } from "@/core/state";
import { matchNotes } from "@/lib/evaluation/transcription";
import { COLOR_PRIMARY, COLOR_OVERLAP } from "@/lib/core/constants";

export class EvaluationHandler {
  constructor(private stateManager: StateManager) {}

  /**
   * Get evaluation-based colored notes
   */
  getEvaluationColoredNotes(
    state: any,
    baseNotes: ColoredNote[],
    highlightMode: string
  ): ColoredNote[] {
    const evalState = this.stateManager.getState().evaluation;

    // Need reference and at least one estimated file
    if (!evalState.refId || evalState.estIds.length === 0) {
      return baseNotes;
    }

    // Find reference and estimated files
    const refFile = state.files.find((f: any) => f.id === evalState.refId);
    const estFiles = (evalState.estIds || [])
      .map((id: string) => state.files.find((f: any) => f.id === id))
      .filter((f: any) => f && f.parsedData);

    if (!refFile?.parsedData || estFiles.length === 0) {
      return baseNotes;
    }

    // Get tolerances
    const tolerances = {
      onsetTolerance: evalState.onsetTolerance,
      pitchTolerance: evalState.pitchTolerance,
      offsetRatioTolerance: evalState.offsetRatioTolerance,
      offsetMinTolerance: evalState.offsetMinTolerance,
    };

    // Helper functions
    const toNumberColor = (c: string | number): number =>
      typeof c === "number" ? c : parseInt(c.replace("#", ""), 16);

    const NEUTRAL_GRAY = 0x444444;
    const HIGHLIGHT = toNumberColor(COLOR_OVERLAP);

    // 1) Run matching for each estimated file and build indexes
    const byRef = new Map<number, Array<{ estId: string; estIdx: number }>>();
    const byEst = new Map<string, Map<number, number>>(); // estId -> (estIdx -> refIdx)

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

    // 2) Build union of intersections per reference note across all estimates
    type Range = { start: number; end: number };
    const mergeRanges = (ranges: Range[]): Range[] => {
      if (ranges.length === 0) return ranges;
      ranges.sort((a, b) => a.start - b.start);
      const out: Range[] = [];
      let cur: Range = { ...ranges[0] };
      for (let i = 1; i < ranges.length; i++) {
        const r = ranges[i];
        if (r.start <= cur.end) {
          cur.end = Math.max(cur.end, r.end);
        } else {
          out.push(cur);
          cur = { ...r };
        }
      }
      out.push(cur);
      return out;
    };

    const unionRangesByRef = new Map<number, Range[]>();
    byRef.forEach((arr, refIdx) => {
      const refNote = refFile.parsedData.notes[refIdx];
      const refOn = refNote.time;
      const refOff = refNote.time + refNote.duration;
      const ranges: Range[] = [];
      const singles: Range[] = [];
      for (const { estId, estIdx } of arr) {
        const estFile = estFiles.find((f: any) => f.id === estId);
        if (!estFile) continue;
        const estNote = estFile.parsedData.notes[estIdx];
        const estOn = estNote.time;
        const estOff = estNote.time + estNote.duration;
        const s = Math.max(refOn, estOn);
        const e = Math.min(refOff, estOff);
        if (e > s) {
          const range = { start: s, end: e };
          ranges.push(range);
          singles.push(range);
        }
      }
      unionRangesByRef.set(refIdx, mergeRanges(ranges));
    });
    const selectedEstCount = estFiles.length;

    // 3) Process notes based on highlight mode
    const result: ColoredNote[] = [];
    const useGrayGlobal = highlightMode.includes("-gray");
    const isExclusiveGlobal = highlightMode.includes("exclusive");

    // Derive simple aggregation mode: pair for single estimate, otherwise OR.
    const estCount = estFiles.length;
    const aggregationMode: "pair" | "or" = estCount <= 1 ? "pair" : "or";

    baseNotes.forEach((coloredNote) => {
      const { note, fileId } = coloredNote;
      const sourceIdx = note.sourceIndex ?? 0;
      const isRef = fileId === evalState.refId;
      const isEst = evalState.estIds.includes(fileId);

      // Non-evaluation files pass through
      if (!isRef && !isEst) {
        result.push(coloredNote);
        return;
      }

      const fileColor = toNumberColor(
        state.files.find((f: any) => f.id === fileId)?.color ?? COLOR_PRIMARY
      );

      // eval-gt-missed-only: only highlight unmatched reference notes
      if (highlightMode === "eval-gt-missed-only") {
        if (isRef) {
          const hasAnyMatch =
            byRef.has(sourceIdx) && byRef.get(sourceIdx)!.length > 0;
          const color = !hasAnyMatch
            ? useGrayGlobal
              ? fileColor
              : fileColor
            : NEUTRAL_GRAY;
          result.push({
            ...coloredNote,
            note: {
              ...note,
              isEvalHighlightSegment: !hasAnyMatch,
              evalSegmentKind: !hasAnyMatch ? "exclusive" : undefined,
            },
            color,
          });
        } else {
          // Estimated notes are grayed out in this mode
          result.push({ ...coloredNote, color: NEUTRAL_GRAY });
        }
        return;
      }

      const nonIntersectColor = useGrayGlobal ? NEUTRAL_GRAY : fileColor;
      // Do not change color for highlight; rely on hatch overlay for visibility
      const intersectColor = fileColor;
      const isExclusive = isExclusiveGlobal;

      // Helper to push segmented fragments
      const pushSegment = (
        start: number,
        end: number,
        color: number,
        flags?: { isEval?: boolean; kind?: "intersection" | "exclusive" }
      ) => {
        const dur = end - start;
        if (dur <= 0) return;
        result.push({
          note: {
            ...note,
            time: start,
            duration: dur,
            isEvalHighlightSegment: flags?.isEval ?? false,
            evalSegmentKind: flags?.kind,
          },
          color,
          fileId: coloredNote.fileId,
          isMuted: coloredNote.isMuted,
        });
      };

      if (isRef) {
        const unionRanges = (unionRangesByRef.get(sourceIdx) || []).slice();
        const noteStart = note.time;
        const noteEnd = note.time + note.duration;

        // Use union-of-intersections (OR) for 1-vs-N comparison
        if (unionRanges.length === 0) {
          // No matches
          if (isExclusive) {
            if (aggregationMode === "pair") {
              // Pair: r \ I_k where I_k is empty => full note highlighted
              pushSegment(noteStart, noteEnd, intersectColor, {
                isEval: true,
                kind: "exclusive",
              });
              return;
            }
            // OR: only highlight exclusive when there was any match
            result.push({ ...coloredNote, color: nonIntersectColor });
            return;
          }
          // Match-intersection modes: non-highlight
          result.push({ ...coloredNote, color: nonIntersectColor });
          return;
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
                isExclusive ? intersectColor : nonIntersectColor,
                isExclusive ? { isEval: true, kind: "exclusive" } : undefined
              );
            }
            pushSegment(
              Math.max(s, noteStart),
              Math.min(e, noteEnd),
              isExclusive ? nonIntersectColor : intersectColor,
              !isExclusive ? { isEval: true, kind: "intersection" } : undefined
            );
            cursor = Math.max(cursor, e);
          }
        }
        if (cursor < noteEnd) {
          pushSegment(
            cursor,
            noteEnd,
            isExclusive ? intersectColor : nonIntersectColor,
            isExclusive ? { isEval: true, kind: "exclusive" } : undefined
          );
        }
        return;
      }

      if (isEst) {
        const refIdx = byEst.get(fileId)?.get(sourceIdx);
        if (refIdx === undefined) {
          // Unmatched estimated note
          if (isExclusive) {
            // e_k \ I_k where I_k is empty => full note highlighted
            const noteStart = note.time;
            const noteEnd = note.time + note.duration;
            pushSegment(noteStart, noteEnd, intersectColor);
          } else {
            result.push({ ...coloredNote, color: nonIntersectColor });
          }
          return;
        }

        const refNote = refFile.parsedData.notes[refIdx];
        const refOn = refNote.time;
        const refOff = refNote.time + refNote.duration;
        const noteStart = note.time;
        const noteEnd = note.time + note.duration;
        const intersectStart = Math.max(refOn, noteStart);
        const intersectEnd = Math.min(refOff, noteEnd);

        if (intersectStart < intersectEnd) {
          // Use pair/OR behaviour with I_k
          // before intersection
          if (noteStart < intersectStart) {
            pushSegment(
              noteStart,
              intersectStart,
              isExclusive ? intersectColor : nonIntersectColor,
              isExclusive ? { isEval: true, kind: "exclusive" } : undefined
            );
          }
          // intersection
          pushSegment(
            intersectStart,
            intersectEnd,
            isExclusive ? nonIntersectColor : intersectColor,
            !isExclusive ? { isEval: true, kind: "intersection" } : undefined
          );
          // after intersection
          if (intersectEnd < noteEnd) {
            pushSegment(
              intersectEnd,
              noteEnd,
              isExclusive ? intersectColor : nonIntersectColor,
              isExclusive ? { isEval: true, kind: "exclusive" } : undefined
            );
          }
        } else {
          // no intersection (should not happen for matched)
          result.push({ ...coloredNote, color: nonIntersectColor });
        }
        return;
      }
    });

    result.sort((a, b) => a.note.time - b.note.time);
    // Optional: render reference notes on top by moving them to the end
    if (evalState.refOnTop && evalState.refId) {
      const refId = evalState.refId;
      const nonRef = result.filter((n) => n.fileId !== refId);
      const ref = result.filter((n) => n.fileId === refId);
      return [...nonRef, ...ref];
    }
    return result;
  }
}
