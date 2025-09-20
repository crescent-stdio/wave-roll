import { ColoredNote } from "@/core/visualization";
import { StateManager } from "@/core/state";
import { matchNotes } from "@/lib/evaluation/transcription";
import { COLOR_PRIMARY, COLOR_OVERLAP, COLOR_A, COLOR_B, COLOR_EVAL_HIGHLIGHT, COLOR_EVAL_EXCLUSIVE, GRAY_EVAL_INTERSECTION, GRAY_EVAL_AMBIGUOUS } from "@/lib/core/constants";
import { mixColorsOklch, blendColorsAverage } from "@/lib/core/utils/color/blend";
import { rgbToHsv, hsvToRgb } from "@/lib/core/utils/color/format";
import { getContrastingGray, getAmbiguousColor } from "@/lib/core/visualization/color-utils";

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
    // WCAG contrast helpers for dynamic grays
    const srgbToLin = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const relLum = (hex: number) => {
      const r = (hex >> 16) & 0xff;
      const g = (hex >> 8) & 0xff;
      const b = hex & 0xff;
      const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    };
    const contrastRatio = (a: number, b: number) => {
      const L1 = relLum(a), L2 = relLum(b);
      const lighter = Math.max(L1, L2) + 0.05;
      const darker = Math.min(L1, L2) + 0.05;
      return lighter / darker;
    };
    // Get a contrasting gray that ensures visibility against the base color
    const aaGrayFor = (base: number): number => {
      // Convert to hex string for color-utils function
      const baseHex = "#" + base.toString(16).padStart(6, "0");
      // Use improved contrast calculation with proper bounds (min: #404040, max: #C0C0C0)
      const grayHex = getContrastingGray(baseHex, 3.5);
      // Convert back to number for PIXI
      return parseInt(grayHex.replace("#", ""), 16);
    };
    // Derive a dynamic, high-contrast alternative without assuming fixed hues
    const complement = (color: number): number => (color ^ 0xffffff) >>> 0;

    const NEUTRAL_GRAY = 0x444444;
    // Anchors for generating highlight colors distinct from base file colours
    const HIGHLIGHT_ANCHOR_REF = toNumberColor(COLOR_EVAL_HIGHLIGHT);
    const HIGHLIGHT_ANCHOR_EST = toNumberColor(COLOR_EVAL_EXCLUSIVE);
    const HIGHLIGHT_BLEND_RATIO = 0.75; // drive farther from base file colour

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

    // 2.5) Build ambiguous overlaps (case 3): unmatched GT/EST with same pitch and near-match timing
    const matchedRef = new Set<number>([...byRef.keys()]);
    const ambiguousByRef = new Map<number, Array<{ start: number; end: number; estId: string; estIdx: number }>>();
    const ambiguousByEst = new Map<string, Map<number, Array<{ start: number; end: number; refIdx: number }>>>();
    // Precompute per-est unmatched sets
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
    // Iterate unmatched refs
    for (let r = 0; r < refFile.parsedData.notes.length; r++) {
      if (matchedRef.has(r)) continue; // only unmatched GT
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
          // Apply stricter ambiguity criteria to avoid over-reporting:
          // - Require sufficient temporal overlap (IoU >= 0.25)
          // - And near-miss on onset or offset within 1.25x tolerance
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
            // Record ambiguous ranges for both REF and EST
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

    // 3) Process notes based on highlight mode
    const result: ColoredNote[] = [];
    const useGrayGlobal = highlightMode.includes("-gray");
    const isExclusiveGlobal = highlightMode.includes("exclusive");
    const isIntersectionOwn = highlightMode.includes("-own");

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
      // Precompute per-file own highlight colour (anchored away from base file colour)
      const ownHighlightColor = isRef
        ? mixColorsOklch(fileColor, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO)
        : isEst
        ? mixColorsOklch(fileColor, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO)
        : fileColor;

      // eval-gt-missed-only: show Reference-only portions in REF color, everything else in a gray
      if (highlightMode === "eval-gt-missed-only") {
        const refEntry = state.files.find((f: any) => f.id === evalState.refId);
        const refBaseColor = toNumberColor(refEntry?.color ?? COLOR_PRIMARY);
        const grayRef = aaGrayFor(refBaseColor);

        if (isRef) {
          const unionRanges = (unionRangesByRef.get(sourceIdx) || []).slice().sort((a,b)=>a.start-b.start);
          const noteStart = note.time;
          const noteEnd = note.time + note.duration;

          if (unionRanges.length === 0) {
            // No matches at all -> entire note is Reference only (use REF color)
            result.push({
              note: { ...note, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
              color: fileColor,
              fileId: coloredNote.fileId,
              isMuted: coloredNote.isMuted,
            });
            return;
          }

          // Split: intersection -> grayRef, exclusive -> REF color
          let cursor = noteStart;
          for (const r of unionRanges) {
            const s = Math.max(noteStart, r.start);
            const e = Math.min(noteEnd, r.end);
            if (s < noteEnd && e > noteStart && s < e) {
              if (cursor < s) {
                // REF-only segment
                result.push({
                  note: { ...note, time: cursor, duration: s - cursor, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
                  color: fileColor,
                  fileId: coloredNote.fileId,
                  isMuted: coloredNote.isMuted,
                });
              }
              // Intersection segment (dimmed gray vs REF color), no overlay
              result.push({
                note: { ...note, time: Math.max(s, noteStart), duration: Math.min(e, noteEnd) - Math.max(s, noteStart), isEvalHighlightSegment: false, noOverlay: true },
                color: grayRef,
                fileId: coloredNote.fileId,
                isMuted: coloredNote.isMuted,
              });
              cursor = Math.max(cursor, e);
            }
          }
          if (cursor < noteEnd) {
            // Tail REF-only segment
            result.push({
              note: { ...note, time: cursor, duration: noteEnd - cursor, isEvalHighlightSegment: true, evalSegmentKind: "exclusive" },
              color: fileColor,
              fileId: coloredNote.fileId,
              isMuted: coloredNote.isMuted,
            });
          }
        } else {
          // Non-reference notes shown in a plain gray (no overlay) with AA contrast vs REF
          result.push({
            note: { ...note, noOverlay: true, isEvalHighlightSegment: false },
            color: grayRef,
            fileId: coloredNote.fileId,
            isMuted: coloredNote.isMuted,
          });
        }
        return;
      }

      // Exclusive emphasis: control how INTERSECTION segments look
      // - exclusive + intersection: gray  -> fixed distinct gray for intersection
      // - exclusive + intersection: own   -> keep file's own base color (not dimmed)
      // - match modes                    -> keep base color
      const nonIntersectBase = fileColor;
      let nonIntersectColor: number;
      if (isExclusiveGlobal) {
        if (useGrayGlobal) {
          nonIntersectColor = parseInt(GRAY_EVAL_INTERSECTION.replace("#", ""), 16);
        } else if (isIntersectionOwn) {
          nonIntersectColor = nonIntersectBase; // own color for intersection parts
        } else {
          // fallback: gently dim, though current UI doesn’t expose this variant
          nonIntersectColor = mixColorsOklch(nonIntersectBase, NEUTRAL_GRAY, 0.75);
        }
      } else {
        nonIntersectColor = nonIntersectBase;
      }
      const isExclusive = isExclusiveGlobal;

      // Helper to push segmented fragments
      const pushSegment = (
        start: number,
        end: number,
        color: number,
        flags?: { isEval?: boolean; kind?: "intersection" | "exclusive" | "ambiguous" }
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

      // Helper: ensure Ambiguous hue is far enough from matched-overlap color
      const ensureDistinctFromOverlap = (ambColor: number, overlapColor: number): number => {
        const intToRgb = (value: number): [number, number, number] => [
          (value >> 16) & 0xff,
          (value >> 8) & 0xff,
          value & 0xff,
        ];
        const rgbToInt = (r: number, g: number, b: number): number => {
          const rr = Math.max(0, Math.min(255, Math.round(r)));
          const gg = Math.max(0, Math.min(255, Math.round(g)));
          const bb = Math.max(0, Math.min(255, Math.round(b)));
          return (rr << 16) | (gg << 8) | bb;
        };
        const hueDist = (a: number, b: number) => {
          const d = Math.abs(a - b) % 360;
          return d > 180 ? 360 - d : d;
        };

        const [ar, ag, ab] = intToRgb(ambColor);
        const [or, og, ob] = intToRgb(overlapColor);
        let [hA, sA, vA] = rgbToHsv(ar, ag, ab);
        const [hO] = rgbToHsv(or, og, ob);
        if (hueDist(hA, hO) >= 55) return ambColor; // far enough

        // Rotate hue by +/- 90° away from overlap to maximize separation
        const plus = (hA + 90) % 360;
        const minus = (hA + 270) % 360;
        const dPlus = hueDist(plus, hO);
        const dMinus = hueDist(minus, hO);
        hA = dPlus >= dMinus ? plus : minus;
        const [nr, ng, nb] = hsvToRgb(hA, sA, Math.min(0.9, Math.max(0.55, vA)));
        return rgbToInt(nr, ng, nb);
      };

      if (isRef) {
        const unionRanges = (unionRangesByRef.get(sourceIdx) || []).slice();
        const noteStart = note.time;
        const noteEnd = note.time + note.duration;
        const ambRanges = (ambiguousByRef.get(sourceIdx) || []).map(r => ({ start: r.start, end: r.end }));
        // Determine REF-side intersection fill color per mode
        let pairIntersectColor = nonIntersectColor;
        if (useGrayGlobal) {
          // Fixed distinct gray for intersection (clear vs ambiguous)
          pairIntersectColor = parseInt(GRAY_EVAL_INTERSECTION.replace("#", ""), 16);
        } else if (isExclusiveGlobal && isIntersectionOwn) {
          // Only in exclusive-* modes do we want intersection-as-own.
          // For match-* modes, keep prior blended intersection color.
          pairIntersectColor = mixColorsOklch(
            fileColor,
            HIGHLIGHT_ANCHOR_REF,
            HIGHLIGHT_BLEND_RATIO
          );
        } else if (estFiles.length >= 1 && byRef.has(sourceIdx)) {
          // Blend REF/EST anchors for intersection when not using "own"
          const pair = byRef.get(sourceIdx)![0]; // 1:1 pairing assumed
          const estFile = estFiles.find((f: any) => f.id === pair.estId);
          if (estFile) {
            const estBase = toNumberColor(estFile.color ?? COLOR_PRIMARY);
            const refOwn = mixColorsOklch(fileColor, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
            const estOwn = mixColorsOklch(estBase, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
            const blended = blendColorsAverage([refOwn, estOwn]);
            pairIntersectColor = mixColorsOklch(blended, 0xffffff, 0.20);
          }
        }

        // Use union-of-intersections (OR) for 1-vs-N comparison
        if (unionRanges.length === 0) {
          // No matches
          // Handle ambiguous overlaps (case 3) first
          if (ambRanges.length > 0) {
            const sortedAmb = ambRanges.sort((a,b)=>a.start-b.start);
            let cur = noteStart;
            for (const r of sortedAmb) {
              const s = Math.max(noteStart, r.start);
              const e = Math.min(noteEnd, r.end);
              if (s < e) {
                if (cur < s) {
                  // background segment
                  pushSegment(cur, s, nonIntersectColor);
                }
                // ambiguous segment color: dynamic (no fixed hue)
                // Find corresponding EST file/color for blend
                const link = ambiguousByRef.get(sourceIdx)![0];
                const estFile = estFiles.find((f:any)=>f.id===link.estId);
                const estBase = estFile ? toNumberColor(estFile.color ?? COLOR_PRIMARY) : fileColor;
                const refOwn = mixColorsOklch(fileColor, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
                const estOwn = mixColorsOklch(estBase, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
                const blended = blendColorsAverage([refOwn, estOwn]);
                // Dynamically generate ambiguous color based on REF and COMP colors
                let ambColor: number;
                if (useGrayGlobal) {
                  ambColor = parseInt(GRAY_EVAL_AMBIGUOUS.replace("#", ""), 16);
                } else {
                  // Convert to hex strings using OWN highlight variants for stronger distinction
                  const refHex = "#" + refOwn.toString(16).padStart(6, "0");
                  const compHex = "#" + estOwn.toString(16).padStart(6, "0");
                  // Get dynamic ambiguous color that's distinct from both REF and COMP
                  const ambHex = getAmbiguousColor(refHex, compHex, 'color');
                  ambColor = parseInt(ambHex.replace("#", ""), 16);
                  // Also ensure it is distinct from matched-overlap color used in match-own
                  const blended = blendColorsAverage([refOwn, estOwn]);
                  const overlap = mixColorsOklch(blended, 0xffffff, 0.20);
                  ambColor = ensureDistinctFromOverlap(ambColor, overlap);
                }
                pushSegment(s, e, ambColor, { isEval: true, kind: "ambiguous" });
                cur = e;
              }
            }
            if (cur < noteEnd) pushSegment(cur, noteEnd, nonIntersectColor);
            return;
          }
          // No match and no ambiguous: fall back to default (non-highlight)
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
        return;
      }

      if (isEst) {
        const refIdx = byEst.get(fileId)?.get(sourceIdx);
        if (refIdx === undefined) {
          // Unmatched estimated note
          const ambMap = ambiguousByEst.get(fileId)!;
          const ambRanges = (ambMap.get(sourceIdx) || []).map(r=>({start:r.start,end:r.end}));
          const noteStart = note.time; const noteEnd = note.time + note.duration;
          if (ambRanges.length > 0) {
            const refBase = toNumberColor(
              state.files.find((f: any) => f.id === evalState.refId)?.color ?? COLOR_PRIMARY
            );
            const refOwn = mixColorsOklch(refBase, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
            const estOwn = mixColorsOklch(fileColor, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
            const blended = blendColorsAverage([refOwn, estOwn]);
            let ambColor: number;
            if (useGrayGlobal) {
              ambColor = parseInt(GRAY_EVAL_AMBIGUOUS.replace("#", ""), 16);
            } else {
              // Use OWN highlight variants for stronger distinction in color mode
              const refOwn = mixColorsOklch(refBase, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
              const estOwn = mixColorsOklch(fileColor, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
              const refHex = "#" + refOwn.toString(16).padStart(6, "0");
              const compHex = "#" + estOwn.toString(16).padStart(6, "0");
              const ambHex = getAmbiguousColor(refHex, compHex, 'color');
              ambColor = parseInt(ambHex.replace("#", ""), 16);
              // Ensure distinctness from the intended matched-overlap color
              const blended = blendColorsAverage([refOwn, estOwn]);
              const overlap = mixColorsOklch(blended, 0xffffff, 0.20);
              ambColor = ensureDistinctFromOverlap(ambColor, overlap);
            }
            const sortedAmb = ambRanges.sort((a,b)=>a.start-b.start);
            let cur = noteStart;
            for (const r of sortedAmb) {
              const s = Math.max(noteStart, r.start);
              const e = Math.min(noteEnd, r.end);
              if (s < e) {
                if (cur < s) pushSegment(cur, s, nonIntersectColor);
                pushSegment(s, e, ambColor, { isEval: true, kind: "ambiguous" });
                cur = e;
              }
            }
            if (cur < noteEnd) pushSegment(cur, noteEnd, nonIntersectColor);
            return;
          }
          // No ambiguous: default fallbacks
          result.push({ ...coloredNote, color: nonIntersectColor });
          return;
        }

        const refNote = refFile.parsedData.notes[refIdx];
        const refOn = refNote.time;
        const refOff = refNote.time + refNote.duration;
        const noteStart = note.time;
        const noteEnd = note.time + note.duration;
        const intersectStart = Math.max(refOn, noteStart);
        const intersectEnd = Math.min(refOff, noteEnd);

        // Compute blended intersection colour for this pair (own vs gray)
        let pairIntersectColor = nonIntersectColor;
        if (useGrayGlobal) {
          pairIntersectColor = parseInt(GRAY_EVAL_INTERSECTION.replace("#", ""), 16);
        } else if (isExclusiveGlobal && isIntersectionOwn) {
          // Only in exclusive-* modes use own for intersection
          pairIntersectColor = mixColorsOklch(
            fileColor,
            HIGHLIGHT_ANCHOR_EST,
            HIGHLIGHT_BLEND_RATIO
          );
        } else {
          const refBase = toNumberColor(
            state.files.find((f: any) => f.id === evalState.refId)?.color ?? COLOR_PRIMARY
          );
          const estBase = fileColor;
          const refOwn = mixColorsOklch(refBase, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
          const estOwn = mixColorsOklch(estBase, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
          const blended = blendColorsAverage([refOwn, estOwn]);
          pairIntersectColor = mixColorsOklch(blended, 0xffffff, 0.20);
        }

        if (intersectStart < intersectEnd) {
          // Use pair/OR behaviour with I_k
          // before intersection
          if (noteStart < intersectStart) {
            pushSegment(
              noteStart,
              intersectStart,
              isExclusive ? ownHighlightColor : nonIntersectColor,
              isExclusive ? { isEval: true, kind: "exclusive" } : undefined
            );
          }
          // intersection
          pushSegment(
            intersectStart,
            intersectEnd,
            isExclusive ? nonIntersectColor : pairIntersectColor,
            !isExclusive ? { isEval: true, kind: "intersection" } : undefined
          );
          // after intersection
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
