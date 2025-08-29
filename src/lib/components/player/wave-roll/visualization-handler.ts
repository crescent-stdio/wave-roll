import { NoteData, ControlChangeEvent } from "@/lib/midi/types";
import { MultiMidiManager } from "@/lib/core/midi/multi-midi-manager";
import {
  COLOR_PRIMARY,
  COLOR_A,
  COLOR_B,
  COLOR_OVERLAP,
} from "@/lib/core/constants";
import { detectOverlappingNotes } from "@/lib/core/utils/midi/overlap";
import { ColoredNote, VisualizationEngine } from "@/core/visualization";
import { StateManager } from "@/core/state";
import { mixColorsOklch } from "@/core/utils/color";
import { EvaluationHandler } from "./evaluation-handler";

export class VisualizationHandler {
  private evaluationHandler: EvaluationHandler;

  constructor(
    private midiManager: MultiMidiManager,
    private stateManager: StateManager,
    private visualizationEngine: VisualizationEngine
  ) {
    this.evaluationHandler = new EvaluationHandler(stateManager);
  }

  /**
   * Update visualization
   */
  updateVisualization(): void {
    // We only need the piano-roll to be ready here; the AudioPlayer will be
    // lazily created by `VisualizationEngine.updateVisualization()` as soon
    // as it receives the first batch of notes.
    if (!this.visualizationEngine?.getPianoRollInstance()) {
      return;
    }

    const state = this.midiManager.getState();

    // Build notes for piano-roll (visible) and audio (all but muted)
    const coloredNotesVisible = this.getColoredNotes(state);

    // --- Audio mixing --------------------------------------------------
    // IMPORTANT: Include ALL files in audioNotes regardless of mute state
    // This prevents audio player recreation when all MIDI tracks are muted
    // The actual muting is handled at the sampler level via setFileMute
    const totalFileCount = state.files.filter(
      (file: any) => file.parsedData
    ).length;
    const velocityScale = 1 / Math.max(1, totalFileCount);

    const audioNotes: NoteData[] = [];
    state.files.forEach((file: any) => {
      if (file.parsedData) {
        // Include ALL notes, even from muted files
        // Muting is handled by the audio player, not by excluding notes
        file.parsedData.notes.forEach((note: NoteData) => {
          // Keep velocity within valid [0,1] range.
          const scaledVel = Math.min(1, note.velocity * velocityScale);
          audioNotes.push({ 
            ...note, 
            velocity: scaledVel, 
            fileId: file.id
          });
        });
      }
    });

    // --------------------------------------------------------------
    // Sustain-pedal CC events (64) for visible tracks
    // --------------------------------------------------------------
    const controlChanges: ControlChangeEvent[] = [];
    state.files.forEach((file: any) => {
      const sustainVisible = file.isSustainVisible ?? true;
      if (
        !file.isPianoRollVisible ||
        !sustainVisible ||
        !file.parsedData?.controlChanges
      )
        return;
      // Stamp each CC event with the originating fileId so the renderer can
      // apply consistent per-track colouring.
      file.parsedData.controlChanges.forEach((cc: ControlChangeEvent) => {
        controlChanges.push({ ...cc, fileId: file.id });
      });
    });
    // Chronological order helps renderer build segments quicker
    controlChanges.sort(
      (a: ControlChangeEvent, b: ControlChangeEvent) => a.time - b.time
    );

    // Update visualization engine
    this.visualizationEngine.updateVisualization(
      coloredNotesVisible,
      audioNotes
    );

    // Push CC data to piano-roll so sustain overlay can render
    const piano = this.visualizationEngine.getPianoRollInstance();
    if (piano) {
      // Get the actual PianoRoll instance for internal property access
      const pianoInstance = (piano as any)._instance;

      // ------------------------------------------------------------
      // Provide original per-file colours (sidebar swatch) so that
      // sustain overlays can stay consistent even when highlight
      // modes recolour the notes.
      // ------------------------------------------------------------
      const fileColors: Record<string, number> = {};
      state.files.forEach((f: any) => {
        if (f.color !== undefined) {
          fileColors[f.id] =
            typeof f.color === "number"
              ? f.color
              : parseInt(String(f.color).replace("#", ""), 16);
        }
      });

      // Assign colour map before pushing CC events so the sustain renderer
      // can access it during the imminent render triggered by
      // `setControlChanges()`.
      if (pianoInstance) {
        (pianoInstance as any).fileColors = fileColors;
      }

      // Provide lightweight file metadata for tooltips so we can render
      // a readable label that shows the file group and display name
      // alongside a colour swatch.
      const evalState = this.stateManager.getState().evaluation;
      const fileInfoMap: Record<
        string,
        { displayName: string; fileName: string; kind: string; color: number }
      > = {};
      state.files.forEach((f: any) => {
        const displayName = f.displayName || f.fileName || f.id;
        const isRef = evalState?.refId === f.id;
        const isEst = Array.isArray(evalState?.estIds)
          ? evalState.estIds.includes(f.id)
          : false;
        const kind = isRef ? "Reference" : isEst ? "Estimate" : "MIDI";
        const color =
          fileColors[f.id] ??
          (typeof f.color === "number"
            ? f.color
            : parseInt(String(f.color ?? 0).replace("#", ""), 16));
        fileInfoMap[f.id] = {
          displayName,
          fileName: f.fileName ?? "",
          kind,
          color,
        };
      });
      if (pianoInstance) {
        (pianoInstance as any).fileInfoMap = fileInfoMap;
      }

      // Pass current highlight mode to the renderer so it can adjust
      // blendMode. Set this _before_ pushing CC events so the upcoming
      // render cycle can pick up the correct mode immediately.
      if (pianoInstance) {
        const visual = this.stateManager.getState().visual;
        (pianoInstance as any).highlightMode = visual.highlightMode;
        (pianoInstance as any).showOnsetMarkers = visual.showOnsetMarkers;
      }

      // Finally, push CC data to piano-roll which will trigger a re-render of
      // the sustain overlay using the freshly injected colour map.
      piano.setControlChanges?.(controlChanges);
    }
  }

  /**
   * Get colored notes from MIDI state
   */
  getColoredNotes(state: any): ColoredNote[] {
    const fallbackColors = [COLOR_PRIMARY, COLOR_A, COLOR_B];

    const toNumberColor = (c: string | number): number =>
      typeof c === "number" ? c : parseInt(c.replace("#", ""), 16);

    // 1) Base notes -------------------------------------------------------
    const baseNotes: ColoredNote[] = [];
    state.files.forEach((file: any, idx: number) => {
      if (!file.isPianoRollVisible || !file.parsedData?.notes) return;

      const raw = file.color ?? fallbackColors[idx % fallbackColors.length];
      const baseColor = toNumberColor(raw);

      file.parsedData.notes.forEach((n: any, noteIdx: number) => {
        baseNotes.push({
          note: { ...n, fileId: file.id, sourceIndex: noteIdx } as NoteData,
          color: baseColor,
          fileId: file.id,
          isMuted: file.isMuted ?? false,
        });
      });
    });

    if (baseNotes.length === 0) return [];

    const highlightMode =
      this.stateManager.getState().visual.highlightMode ?? "file";

    // Plain per-file colouring -> return early ---------------------------
    if (highlightMode === "file") {
      return baseNotes;
    }

    // Check if this is an evaluation-based highlight mode
    if (highlightMode.startsWith("eval-")) {
      return this.evaluationHandler.getEvaluationColoredNotes(
        state,
        baseNotes,
        highlightMode
      );
    }

    // 2) Overlap analysis -------------------------------------------------
    const overlaps = detectOverlappingNotes(baseNotes);

    // Utility functions ---------------------------------------------------
    // Darker neutral gray so the highlight stands out more
    const NEUTRAL_GRAY = 0x444444;
    const HIGHLIGHT = toNumberColor(COLOR_OVERLAP);

    const overlapColor = (base: number): number => {
      switch (highlightMode) {
        case "highlight-simple":
          // Brighten overlap (file color + light yellow)
          return mixColorsOklch(base, 0xffff99, 0.85);
        case "highlight-blend":
          // Keep per-file color; rely on additive renderer blend to sum colors
          return base;
        case "highlight-exclusive":
          // Slightly brighten to emphasize exclusive segments
          return mixColorsOklch(base, HIGHLIGHT, 0.8);
        default:
          return base;
      }
    };

    const baseColorVariant = (base: number): number =>
      highlightMode === "highlight-exclusive" ? NEUTRAL_GRAY : base;

    // 3) Split into segments --------------------------------------------
    const result: ColoredNote[] = [];

    baseNotes.forEach((orig, idx) => {
      const ranges = overlaps.get(idx) ?? [];

      if (ranges.length === 0) {
        result.push({ ...orig, color: baseColorVariant(orig.color) });
        return;
      }

      const sorted = [...ranges].sort((a, b) => a.start - b.start);
      let cursor = orig.note.time;
      const end = orig.note.time + orig.note.duration;

      const push = (start: number, dur: number, col: number) => {
        if (dur <= 0) return;
        result.push({
          note: { ...orig.note, time: start, duration: dur },
          color: col,
          fileId: orig.fileId,
          isMuted: orig.isMuted,
        });
      };

      sorted.forEach(({ start, end: e }) => {
        push(cursor, start - cursor, baseColorVariant(orig.color));
        push(start, e - start, overlapColor(orig.color));
        cursor = Math.max(cursor, e);
      });

      push(cursor, end - cursor, baseColorVariant(orig.color));
    });

    result.sort((a, b) => a.note.time - b.note.time);
    return result;
  }

  /**
   * Update piano roll time position
   */
  updatePianoRoll(): void {
    const pianoRollInstance = this.visualizationEngine.getPianoRollInstance();
    if (pianoRollInstance) {
      pianoRollInstance.setTime(
        this.visualizationEngine.getState().currentTime
      );
    }
  }
}
