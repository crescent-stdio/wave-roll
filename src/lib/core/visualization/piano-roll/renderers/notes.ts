import * as PIXI from "pixi.js";
// BLEND_MODES isn’t exposed in the public typings, fall back to `any` access
import { PianoRoll } from "../piano-roll";
import { NoteData } from "@/lib/midi/types";
import {
  computeNoteMetrics,
  DEFAULT_TOLERANCES,
} from "@/lib/evaluation/transcription";

// Extend PIXI.Sprite to tag the originating note (for tooltips)
interface NoteSprite extends PIXI.Sprite {
  noteData?: NoteData;
}

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
  const zoomY = pianoRoll.state.zoomY;

  // 1) Ensure Sprite pool size matches notes.length -----------------------
  const baseTexture = PIXI.Texture.WHITE;

  while (pianoRoll.noteSprites.length < pianoRoll.notes.length) {
    const sprite = new PIXI.Sprite(baseTexture) as NoteSprite;
    // Enable pointer interactions to show tooltip on hover
    sprite.eventMode = "static"; // Pixi v8: enables hit-testing but non-draggable
    sprite.cursor = "pointer";

    // Pointer events for tooltip -----------------------------
    sprite.on("pointerover", (e: PIXI.FederatedPointerEvent) => {
      const noteData = sprite.noteData;
      if (noteData) {
        pianoRoll.showNoteTooltip(noteData, e);
      }
    });

    sprite.on("pointermove", (e: PIXI.FederatedPointerEvent) => {
      pianoRoll.moveTooltip(e);
    });

    sprite.on("pointerout", () => {
      pianoRoll.hideTooltip();
    });
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
    const sprite = pianoRoll.noteSprites[idx] as NoteSprite;

    // Compute geometry once; container pan is applied globally elsewhere.
    const x =
      pianoRoll.timeScale(note.time) * pianoRoll.state.zoomX + pianoKeysOffset;
    const yBase = pianoRoll.pitchScale(note.midi);
    const canvasMid = pianoRoll.options.height / 2;
    const y = (yBase - canvasMid) * zoomY + canvasMid;
    const width = pianoRoll.timeScale(note.duration) * pianoRoll.state.zoomX;
    const height = Math.max(1, baseRowHeight * 0.8 * zoomY);

    sprite.x = x;
    sprite.y = y - height / 2;
    sprite.width = width;
    sprite.height = height;

    // Color and alpha ---------------------------------
    const noteColor = pianoRoll.options.noteRenderer
      ? pianoRoll.options.noteRenderer(note, idx)
      : pianoRoll.options.noteColor;

    sprite.tint = noteColor;

    // Store current note data on the sprite for tooltip access
    sprite.noteData = note;

    // Apply transparency only for GRAY notes to avoid overly dark appearance
    // The neutral gray used across evaluation/highlight modes is 0x444444.
    const NEUTRAL_GRAY_NOTE = 0x444444;
    sprite.alpha = noteColor === NEUTRAL_GRAY_NOTE ? 0.5 : 1;

    // Apply additive blending when the global highlight mode requests it
    const hl = (pianoRoll as any).highlightMode ?? "file";
    sprite.blendMode = hl === "highlight-blend" ? "add" : ("normal" as any);
  });
}
