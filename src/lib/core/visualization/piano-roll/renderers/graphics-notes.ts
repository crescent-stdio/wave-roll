import * as PIXI from "pixi.js";
import { PianoRoll } from "../piano-roll";
import { NoteData } from "@/lib/midi/types";

/**
 * Legacy Graphics-based note renderer.
 *
 * This implementation remains available for projects that specifically
 * require vector Graphics primitives (e.g., custom shaders) or where the
 * memory footprint of thousands of Sprite instances is prohibitive. The
 * default renderer has switched to Sprite+batching for better large-scale
 * performance.
 */
export function renderNotesGraphics(pianoRoll: PianoRoll): void {
  const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;

  // Pre-compute shared constants
  const noteRange =
    pianoRoll.options.noteRange.max - pianoRoll.options.noteRange.min;
  const baseRowHeight = (pianoRoll.options.height - 40) / noteRange; // per-semitone height

  // 1) Keep the Graphics pool size in sync with `notes.length`
  while (pianoRoll.noteGraphics.length < pianoRoll.notes.length) {
    const g = new PIXI.Graphics();
    pianoRoll.notesContainer.addChild(g);
    pianoRoll.noteGraphics.push(g);
  }
  while (pianoRoll.noteGraphics.length > pianoRoll.notes.length) {
    const g = pianoRoll.noteGraphics.pop();
    if (g) {
      pianoRoll.notesContainer.removeChild(g);
      g.destroy();
    }
  }

  // 2) Update position & style
  pianoRoll.notes.forEach((note: NoteData, idx: number) => {
    const x =
      pianoRoll.timeScale(note.time) * pianoRoll.state.zoomX + pianoKeysOffset;
    const y = pianoRoll.pitchScale(note.midi);
    const width = pianoRoll.timeScale(note.duration) * pianoRoll.state.zoomX;
    const height = Math.max(1, baseRowHeight * 0.8);

    const g = pianoRoll.noteGraphics[idx];
    g.clear();

    const noteColor = pianoRoll.options.noteRenderer
      ? pianoRoll.options.noteRenderer(note, idx)
      : pianoRoll.options.noteColor;

    // Apply transparency only for GRAY notes to avoid overly dark appearance
    // The neutral gray used across evaluation/highlight modes is 0x444444.
    const NEUTRAL_GRAY_NOTE = 0x444444;
    const alpha = noteColor === NEUTRAL_GRAY_NOTE ? 0.5 : 1;

    g.rect(x, y - height / 2, width, height);
    g.fill({ color: noteColor, alpha });
    g.stroke({
      width: 1,
      color: noteColor,
      alpha: Math.min(1, alpha + 0.2),
    });
  });
}
