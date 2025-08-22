import * as PIXI from "pixi.js";
// BLEND_MODES isn’t exposed in the public typings, fall back to `any` access
import { PianoRoll } from "../piano-roll";
import { NoteData } from "@/lib/midi/types";
import {
  COLOR_EVAL_HIGHLIGHT,
  COLOR_EVAL_EXCLUSIVE,
} from "@/lib/core/constants";
import {
  computeNoteMetrics,
  DEFAULT_TOLERANCES,
} from "@/lib/evaluation/transcription";

// Cache for hatch textures keyed by orientation to avoid recreating
let WR_HATCH_TEXTURE_CACHE: Record<"up" | "down", PIXI.Texture> = {
  up: null as unknown as PIXI.Texture,
  down: null as unknown as PIXI.Texture,
};

// Extend PIXI.Sprite to tag the originating note (for tooltips)
interface NoteSprite extends PIXI.Sprite {
  noteData?: NoteData;
  labelText?: PIXI.Text;
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
  // Derive row height from pitchScale range so it automatically respects
  // reserved bottom space (e.g., waveform band) configured in createScales.
  const pitchMinY = pianoRoll.pitchScale(pianoRoll.options.noteRange.min);
  const pitchMaxY = pianoRoll.pitchScale(pianoRoll.options.noteRange.max);
  const usablePitchSpanPx = Math.abs(pitchMinY - pitchMaxY);
  const baseRowHeight = usablePitchSpanPx / Math.max(1, noteRange);
  const zoomY = pianoRoll.state.zoomY;

  // 1) Ensure Sprite pool size matches notes.length -----------------------
  const baseTexture = PIXI.Texture.WHITE;

  // Prepare diagonal-hatch textures for overlay with emphasized visibility
  function getHatchTexture(direction: "up" | "down" = "up"): PIXI.Texture {
    const cached = WR_HATCH_TEXTURE_CACHE[direction];
    if (cached && (cached as any).valid !== false) {
      return cached;
    }

    // Larger tile and thicker line to improve visibility
    const size = 12;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.lineCap = "butt";
    ctx.beginPath();

    if (direction === "up") {
      // 45° (bottom-left ➜ top-right)
      ctx.moveTo(-2, size - 2);
      ctx.lineTo(size - 2, -2);
      ctx.moveTo(0, size);
      ctx.lineTo(size, 0);
      ctx.moveTo(2, size + 2);
      ctx.lineTo(size + 2, 2);
    } else {
      // -45° (top-left ➜ bottom-right)
      ctx.moveTo(-2, -2);
      ctx.lineTo(size - 2, size - 2);
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size);
      ctx.moveTo(2, 2);
      ctx.lineTo(size + 2, size + 2);
    }

    ctx.stroke();
    const tex = PIXI.Texture.from(canvas);
    // Pixi v8: use Texture.source.style.addressMode = 'repeat'
    if ((tex as any).source?.style) {
      (tex as any).source.style.addressMode = "repeat";
    }
    WR_HATCH_TEXTURE_CACHE[direction] = tex;
    return tex;
  }

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
    // Ensure hatch overlay pool matches sprite pool
    const hatchSprites = ((pianoRoll as any).hatchSprites ??=
      []) as PIXI.TilingSprite[];
    // Pixi v8: TilingSprite accepts an options object
    const overlay = new (PIXI as any).TilingSprite({
      texture: getHatchTexture("up"),
      width: 1,
      height: 1,
    }) as PIXI.TilingSprite;
    overlay.visible = false;
    overlay.alpha = 0.55;
    overlay.tint = parseInt(COLOR_EVAL_HIGHLIGHT.replace("#", ""), 16);
    pianoRoll.notesContainer.addChild(overlay);
    hatchSprites.push(overlay);
  }
  while (pianoRoll.noteSprites.length > pianoRoll.notes.length) {
    const s = pianoRoll.noteSprites.pop();
    if (s) {
      pianoRoll.notesContainer.removeChild(s);
      s.destroy();
    }
    const hatchSprites = (pianoRoll as any).hatchSprites as
      | PIXI.TilingSprite[]
      | undefined;
    if (hatchSprites && hatchSprites.length > pianoRoll.noteSprites.length) {
      const o = hatchSprites.pop();
      if (o) {
        pianoRoll.notesContainer.removeChild(o);
        o.destroy();
      }
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

    // Hatch overlay driven by eval flags on note fragments
    const hatchSprites = ((pianoRoll as any).hatchSprites ??=
      []) as PIXI.TilingSprite[];
    const overlay = hatchSprites[idx];
    if (overlay) {
      const isEvalFragment = note.isEvalHighlightSegment === true;
      if (isEvalFragment) {
        // Use intersection/exclusive to select overlay style
        const kind = note.evalSegmentKind ?? "intersection";
        const tint =
          kind === "exclusive"
            ? parseInt(COLOR_EVAL_EXCLUSIVE.replace("#", ""), 16)
            : parseInt(COLOR_EVAL_HIGHLIGHT.replace("#", ""), 16);
        overlay.visible = true;
        overlay.x = sprite.x;
        overlay.y = sprite.y;
        overlay.width = sprite.width;
        overlay.height = sprite.height;
        overlay.tilePosition.set(0, 0);
        // Set hatch orientation by kind to increase visual distinction
        overlay.texture = getHatchTexture(kind === "exclusive" ? "down" : "up");
        overlay.tint = tint;
        // Make hatching more prominent as requested
        overlay.alpha = 0.75;
        // Screen blending tends to pop on both dark and bright base colors
        overlay.blendMode = "screen" as any;

        // Scale hatch so it remains visible on very short notes
        const targetStripeThickness = 10; // px in note space
        const scale = Math.max(1, targetStripeThickness / Math.max(6, height));
        overlay.tileScale.set(scale, scale);
      } else {
        overlay.visible = false;
      }
    }
  });
}
