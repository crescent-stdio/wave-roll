import * as PIXI from "pixi.js";
import { PianoRoll } from "../piano-roll";
import { NoteData } from "@/lib/midi/types";

// Cache-friendly note rendering.
// ------------------------------------------------------------
// • Re-use `PIXI.Graphics` objects instead of creating/destroying them each frame.
// • As long as the note count stays the same we simply `clear → redraw`,
//   which massively reduces GC pressure and WebGL upload cost.
// ------------------------------------------------------------

export function renderNotes(pianoRoll: PianoRoll): void {
  const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;

  // Pre-compute shared constants
  const noteRange =
    pianoRoll.options.noteRange.max - pianoRoll.options.noteRange.min;
  const baseRowHeight = (pianoRoll.options.height - 40) / noteRange; // per-semitone height

  // 1) Keep the Graphics pool size in sync with `notes.length` ------------
  //    Create new instances if we don’t have enough; destroy surplus ones.
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

  // 2) Update position & style --------------------------------------------
  pianoRoll.notes.forEach((note: NoteData, idx: number) => {
    // Horizontal position without `panX`; overall timeline offset is now
    // applied by translating `notesContainer.x` once per frame in
    // PianoRoll.render(). This avoids per-note coordinate re-calculation
    // during continuous scrolling.
    const x =
      pianoRoll.timeScale(note.time) * pianoRoll.state.zoomX + pianoKeysOffset;
    const y = pianoRoll.pitchScale(note.midi); // No Y zoom/pan
    const width = pianoRoll.timeScale(note.duration) * pianoRoll.state.zoomX;
    const height = Math.max(1, baseRowHeight * 0.8);

    const g = pianoRoll.noteGraphics[idx];

    // Reset geometry
    g.clear();

    // Determine color (custom renderer takes priority)
    const noteColor = pianoRoll.options.noteRenderer
      ? pianoRoll.options.noteRenderer(note, idx)
      : pianoRoll.options.noteColor;

    const velocity = isFinite(note.velocity)
      ? Math.max(0, Math.min(1, note.velocity))
      : 0.5;
    const alpha = 0.3 + velocity * 0.7;

    // Draw rectangle once, then apply fill and stroke.
    g.rect(x, y - height / 2, width, height);
    g.fill({ color: noteColor, alpha });
    g.stroke({
      width: 1,
      color: noteColor,
      alpha: Math.min(1, alpha + 0.2),
    });
  });
}
