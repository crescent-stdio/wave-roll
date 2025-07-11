import * as PIXI from "pixi.js";
import { PianoRoll } from "../piano-roll";
import { NoteData } from "@/lib/midi/types";

export function renderNotes(pianoRoll: PianoRoll): void {
  // Clear existing note graphics
  pianoRoll.noteGraphics.forEach((graphic: PIXI.Graphics) => {
    pianoRoll.notesContainer.removeChild(graphic);
    graphic.destroy();
  });
  pianoRoll.noteGraphics = [];

  /* ------------------------------------------------------------------
   * Previous implementation aggressively culled notes that were deemed
   * outside the visible viewport, but an incorrect viewport calculation
   * occasionally caused **all** notes to be skipped – resulting in an
   * empty piano-roll even though the play-head was visible.
   *
   * Until a more robust dynamic-culling algorithm is re-introduced, we
   * simply render every note and rely on Pixi’s internal viewport
   * clipping for off-screen graphics. This guarantees that users always
   * see the score, at the minor cost of rendering a few extra quads.
   * ------------------------------------------------------------------ */

  const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;

  if (pianoRoll.notes.length > 0) {
    // console.log(
    //   "[renderNotes] initial note",
    //   pianoRoll.notes[0].time,
    //   pianoRoll.timeScale(pianoRoll.notes[0].time) * pianoRoll.state.zoomX +
    //     pianoRoll.state.panX +
    //     pianoKeysOffset
    // );
  }

  pianoRoll.notes.forEach((note: NoteData, index: number) => {
    const x =
      pianoRoll.timeScale(note.time) * pianoRoll.state.zoomX +
      pianoRoll.state.panX +
      pianoKeysOffset;
    const y = pianoRoll.pitchScale(note.midi); // No Y zoom/pan
    const width = pianoRoll.timeScale(note.duration) * pianoRoll.state.zoomX;

    // if (index === 0) {
    //   if (index === 0) {
    //     console.log("[renderNotes] first-x", x, "panX", pianoRoll.state.panX);
    //   }
    // }

    // Fixed note height calculation: no Y zoom
    const noteRange =
      pianoRoll.options.noteRange.max - pianoRoll.options.noteRange.min;
    const baseRowHeight = (pianoRoll.options.height - 40) / noteRange; // Base height per semitone
    const height = Math.max(1, baseRowHeight * 0.8); // 80% of row for spacing, no zoom

    const noteGraphic = new PIXI.Graphics();

    // Determine note color using custom renderer or default
    const noteColor = pianoRoll.options.noteRenderer
      ? pianoRoll.options.noteRenderer(note, index)
      : pianoRoll.options.noteColor;

    // Note color based on velocity – clamp velocity ∈ [0,1] to avoid NaN alpha
    const velocity = isFinite(note.velocity)
      ? Math.max(0, Math.min(1, note.velocity))
      : 0.5;
    const alpha = 0.3 + velocity * 0.7; // Scale alpha based on velocity

    // Draw filled rectangle
    noteGraphic.rect(x, y - height / 2, width, height);
    noteGraphic.fill({ color: noteColor, alpha });

    // Note border
    noteGraphic.rect(x, y - height / 2, width, height);
    noteGraphic.stroke({
      width: 1,
      color: noteColor,
      alpha: Math.min(1, alpha + 0.2),
    });

    pianoRoll.notesContainer.addChild(noteGraphic);
    pianoRoll.noteGraphics.push(noteGraphic);
  });
}
