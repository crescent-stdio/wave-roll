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
    // For AND aggregation: keep per-est single intersection to compute a global intersection A(r)
    const singleIntersectionByRef: Map<number, Array<Range>> = new Map();
    // Track whether a ref has matches from all selected estimates
    const allMatchedByRef = new Map<number, boolean>();
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
      if (singles.length > 0) singleIntersectionByRef.set(refIdx, singles);
      // We'll fill allMatchedByRef after we know selectedEstCount below
    });

    // Compute AND intersection A(r) per reference as a single range (or empty)
    const andRangeByRef = new Map<number, Range | null>();
    const selectedEstCount = estFiles.length;
    byRef.forEach((arr, refIdx) => {
      // Require matches from all selected estimates to form A(r)
      const hasAll = arr.length >= selectedEstCount;
      allMatchedByRef.set(refIdx, hasAll);
      if (!hasAll) {
        andRangeByRef.set(refIdx, null);
        return;
      }
      const singles = singleIntersectionByRef.get(refIdx) || [];
      if (singles.length < selectedEstCount) {
        andRangeByRef.set(refIdx, null);
        return;
      }
      // Intersection across all I_k: [max(starts), min(ends)]
      let start = -Infinity;
      let end = Infinity;
      for (const r of singles) {
        start = Math.max(start, r.start);
        end = Math.min(end, r.end);
      }
      if (end > start) {
        andRangeByRef.set(refIdx, { start, end });
      } else {
        andRangeByRef.set(refIdx, null);
      }
    });

    // 3) Process notes based on highlight mode
    const result: ColoredNote[] = [];
    const useGrayGlobal = highlightMode.includes("-gray");
    const isExclusiveGlobal = highlightMode.includes("exclusive");

    // Derive comparison aggregation mode without changing public types:
    // - pair: when exactly one estimated file is selected
    // - aggregate-and: when kOfN equals the number of selected estimates
    // - aggregate-or: otherwise (default)
    const estCount = estFiles.length;
    const kOfN = this.stateManager.getState().evaluation.kOfN;
    const aggregationMode: "pair" | "and" | "or" =
      estCount <= 1 ? "pair" : kOfN >= estCount ? "and" : "or";

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

        // Determine highlight ranges for reference depending on aggregation and mode
        if (aggregationMode === "and") {
          const aRange = andRangeByRef.get(sourceIdx) || null;
          const hasAll = allMatchedByRef.get(sourceIdx) === true;
          if (!aRange) {
            // If not all matched -> non-highlight. If all matched but A(r) is empty -> full exclusive highlight, otherwise non-exclusive has no highlight.
            if (isExclusive && hasAll) {
              pushSegment(noteStart, noteEnd, intersectColor, {
                isEval: true,
                kind: "exclusive",
              });
            } else {
              result.push({ ...coloredNote, color: nonIntersectColor });
            }
            return;
          }

          // Segment using A(r)
          const s = Math.max(noteStart, aRange.start);
          const e = Math.min(noteEnd, aRange.end);
          if (noteStart < s) {
            pushSegment(
              noteStart,
              s,
              isExclusive ? intersectColor : nonIntersectColor,
              isExclusive ? { isEval: true, kind: "exclusive" } : undefined
            );
          }
          pushSegment(
            s,
            e,
            isExclusive ? nonIntersectColor : intersectColor,
            !isExclusive ? { isEval: true, kind: "intersection" } : undefined
          );
          if (e < noteEnd) {
            pushSegment(
              e,
              noteEnd,
              isExclusive ? intersectColor : nonIntersectColor,
              isExclusive ? { isEval: true, kind: "exclusive" } : undefined
            );
          }
          return;
        }

        // pair / or -> use union of intersections U(r)
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
            isExclusive ? intersectColor : nonIntersectColor
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
          // For match-intersection modes under AND aggregation, limit to I_k ∩ A(r)
          if (!isExclusive && aggregationMode === "and") {
            const aRange = andRangeByRef.get(refIdx) || null;
            if (!aRange) {
              // No A(r): est note remains non-highlighted entirely
              result.push({ ...coloredNote, color: nonIntersectColor });
              return;
            }
            const hlStart = Math.max(intersectStart, aRange.start);
            const hlEnd = Math.min(intersectEnd, aRange.end);
            // before I_k ∩ A(r)
            if (noteStart < hlStart) {
              pushSegment(noteStart, hlStart, nonIntersectColor);
            }
            // I_k ∩ A(r)
            if (hlStart < hlEnd) {
              pushSegment(hlStart, hlEnd, intersectColor);
            }
            // after
            if (hlEnd < noteEnd) {
              pushSegment(hlEnd, noteEnd, nonIntersectColor);
            }
            return;
          }

          // Default: use pair/OR behaviour with I_k
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