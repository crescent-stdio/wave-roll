import * as PIXI from "pixi.js";
import { PianoRoll } from "../piano-roll";
import { NoteData } from "@/lib/midi/types";

/**
 * Default Sprite-based note renderer with automatic batching.
 *
 * Renders every MIDI note as a `PIXI.Sprite` that shares a common 1×1 white
 * texture. Color is applied via `tint`, and dimensions are set with
 * `sprite.width/height` for maximum batching efficiency.
 *
 * Compared to the legacy Graphics renderer this trades a small per-sprite
 * memory overhead for dramatically lower draw-call count once the number of
 * notes exceeds a few hundred.
 */
export function renderNotes(pianoRoll: PianoRoll): void {
  const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;

  // Pre-compute constants for vertical sizing
  const noteRange =
    pianoRoll.options.noteRange.max - pianoRoll.options.noteRange.min;
  const baseRowHeight = (pianoRoll.options.height - 40) / noteRange;

  // 1) Ensure Sprite pool size matches notes.length -----------------------
  const baseTexture = PIXI.Texture.WHITE;

  while (pianoRoll.noteSprites.length < pianoRoll.notes.length) {
    const sprite = new PIXI.Sprite(baseTexture);
    pianoRoll.notesContainer.addChild(sprite);
    pianoRoll.noteSprites.push(sprite);
  }
  while (pianoRoll.noteSprites.length > pianoRoll.notes.length) {
    const s = pianoRoll.noteSprites.pop();
    if (s) {
      pianoRoll.notesContainer.removeChild(s);
      s.destroy();
    }
  }

  // 2) Update transform & style ------------------------------------------
  pianoRoll.notes.forEach((note: NoteData, idx: number) => {
    const sprite = pianoRoll.noteSprites[idx];

    // Compute geometry once; container pan is applied globally elsewhere.
    const x =
      pianoRoll.timeScale(note.time) * pianoRoll.state.zoomX + pianoKeysOffset;
    const y = pianoRoll.pitchScale(note.midi);
    const width = pianoRoll.timeScale(note.duration) * pianoRoll.state.zoomX;
    const height = Math.max(1, baseRowHeight * 0.8);

    sprite.x = x;
    sprite.y = y - height / 2;
    sprite.width = width;
    sprite.height = height;

    // Color and alpha ---------------------------------
    const noteColor = pianoRoll.options.noteRenderer
      ? pianoRoll.options.noteRenderer(note, idx)
      : pianoRoll.options.noteColor;

    sprite.tint = noteColor;

    const velocity = isFinite(note.velocity)
      ? Math.max(0, Math.min(1, note.velocity))
      : 0.5;
    sprite.alpha = 0.3 + velocity * 0.7;
  });
}
