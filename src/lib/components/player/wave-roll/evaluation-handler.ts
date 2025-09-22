import { ColoredNote } from "@/core/visualization";
import { StateManager } from "@/core/state";
import { COLOR_PRIMARY, GRAY_EVAL_INTERSECTION, GRAY_EVAL_AMBIGUOUS } from "@/lib/core/constants";
import { mixColorsOklch, blendColorsAverage } from "@/lib/core/utils/color/blend";
import { hsvToRgb, rgbToHsv } from "@/lib/core/utils/color/format";
import { getAmbiguousColor } from "@/lib/core/visualization/color-utils";
import { toNumberColor, aaGrayFor, NEUTRAL_GRAY, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO } from "@/lib/components/player/wave-roll/evaluation/colors";
import { buildMatchIndex, buildUnionRangesByRef } from "@/lib/components/player/wave-roll/evaluation/match-index";
import { buildAmbiguities } from "@/lib/components/player/wave-roll/evaluation/ambiguity";
import { parseModeFlags } from "@/lib/components/player/wave-roll/evaluation/mode-flags";
import { handleGtMissedOnly } from "@/lib/components/player/wave-roll/evaluation/handlers/gt-missed-only";
import { handleOnlyModes } from "@/lib/components/player/wave-roll/evaluation/handlers/only-modes";
import { handleRegular } from "@/lib/components/player/wave-roll/evaluation/handlers/regular";

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

    // Color anchors and helpers are imported from evaluation/colors

    // 1) Run matching for each estimated file and build indexes
    const { byRef, byEst } = buildMatchIndex(refFile, estFiles, tolerances);

    // 2) Build union of intersections per reference note across all estimates
    const unionRangesByRef = buildUnionRangesByRef(byRef, refFile, estFiles);

    // 2.5) Build ambiguous overlaps (case 3)
    const { ambiguousByRef, ambiguousByEst } = buildAmbiguities(refFile, estFiles, byRef, byEst, tolerances);

    // 3) Process notes based on highlight mode
    const result: ColoredNote[] = [];
    const {
      useGrayGlobal,
      isExclusiveGlobal,
      isIntersectionOwn,
      isTpOnly,
      isFpOnly,
      isFnOnly,
      isOnlyMode,
      aggregationMode,
    } = parseModeFlags(highlightMode, estFiles.length);

    baseNotes.forEach((coloredNote) => {
      const { note, fileId } = coloredNote;
      const sourceIdx = note.sourceIndex ?? 0;
      const isRef = fileId === evalState.refId;
      const isEst = evalState.estIds.includes(fileId);

      // Non-evaluation files: in ONLY modes, hide; otherwise pass-through
      if (!isRef && !isEst) {
        if (!isOnlyMode) {
          result.push(coloredNote);
        }
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

      // eval-gt-missed-only(-own|-gray)
      if (handleGtMissedOnly({
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
      })) {
            return;
          }

      if (handleOnlyModes({
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
      })) {
        return;
      }

      const nonIntersectBase = fileColor;
      let nonIntersectColor: number;
      if (isExclusiveGlobal) {
        if (useGrayGlobal) {
          nonIntersectColor = parseInt(GRAY_EVAL_INTERSECTION.replace("#", ""), 16);
        } else if (isIntersectionOwn) {
          nonIntersectColor = nonIntersectBase;
        } else {
          nonIntersectColor = mixColorsOklch(nonIntersectBase, NEUTRAL_GRAY, 0.75);
        }
      } else {
        nonIntersectColor = nonIntersectBase;
      }
      const isExclusive = isExclusiveGlobal;

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

      if (handleRegular({
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
      })) {
        return;
      }

      if (isEst) {
        const refIdx = byEst.get(fileId)?.get(sourceIdx);
        if (refIdx === undefined) {
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
              const refOwn2 = mixColorsOklch(refBase, HIGHLIGHT_ANCHOR_REF, HIGHLIGHT_BLEND_RATIO);
              const estOwn2 = mixColorsOklch(fileColor, HIGHLIGHT_ANCHOR_EST, HIGHLIGHT_BLEND_RATIO);
              const refHex = "#" + refOwn2.toString(16).padStart(6, "0");
              const compHex = "#" + estOwn2.toString(16).padStart(6, "0");
              const ambHex = getAmbiguousColor(refHex, compHex, 'color');
              ambColor = parseInt(ambHex.replace("#", ""), 16);
              const blended2 = blendColorsAverage([refOwn2, estOwn2]);
              const overlap = mixColorsOklch(blended2, 0xffffff, 0.20);
              const [or, og, ob] = [ (overlap>>16)&0xff, (overlap>>8)&0xff, overlap&0xff ];
              const rgbToInt = (r:number,g:number,b:number)=>((Math.max(0,Math.min(255,Math.round(r)))<<16)| (Math.max(0,Math.min(255,Math.round(g)))<<8)| Math.max(0,Math.min(255,Math.round(b))));
              const hueDist = (a:number,b:number)=>{ const d=Math.abs(a-b)%360; return d>180?360-d:d; };
              const { rgbToHsv, hsvToRgb } = { rgbToHsv: (r:number,g:number,b:number)=>{
                const v=Math.max(r,g,b), c=v-Math.min(r,g,b); const h=c&&(v==r?(g-b)/c:(v==g?2+(b-r)/c:4+(r-g)/c)); return [Math.round(60*(h<0?h+6:h)), v&&c/v, v/255];
              }, hsvToRgb: (h:number,s:number,v:number)=>{
                const f=(n:number,k=(n+h/60)%6)=>v*255*(1-s*Math.max(0,Math.min(k,4-k,1))); return [f(5),f(3),f(1)];
              }} as any;
              const intToRgb = (value: number): [number, number, number] => [
                (value >> 16) & 0xff,
                (value >> 8) & 0xff,
                value & 0xff,
              ];
              const [ar, ag, ab] = intToRgb(ambColor);
              let [hA, sA, vA] = rgbToHsv(ar, ag, ab);
              const [hO] = rgbToHsv(or, og, ob);
              if (hueDist(hA, hO) < 55) {
                const plus = (hA + 90) % 360;
                const minus = (hA + 270) % 360;
                const dPlus = hueDist(plus, hO);
                const dMinus = hueDist(minus, hO);
                hA = dPlus >= dMinus ? plus : minus;
                const [nr, ng, nb] = hsvToRgb(hA, sA, Math.min(0.9, Math.max(0.55, vA)));
                ambColor = rgbToInt(nr, ng, nb);
              }
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
          result.push({ ...coloredNote, color: nonIntersectColor });
          return;
        }
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
