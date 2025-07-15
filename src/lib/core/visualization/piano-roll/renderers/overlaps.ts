import * as PIXI from "pixi.js";
import { PianoRoll } from "../piano-roll";
import { NoteInterval } from "@/lib/core/controls/utils/overlap";

/** Default color for overlap highlights (rgba(255,0,0,0.25)) */
export const OVERLAP_COLOR = 0xff0000;
const OVERLAP_ALPHA = 0.25;

/**
 * Draws translucent bars marking timeline segments where ≥2 tracks overlap.
 */
export function drawOverlapRegions(
  pianoRoll: PianoRoll,
  overlaps: NoteInterval[],
  color: number = OVERLAP_COLOR,
  alpha: number = OVERLAP_ALPHA
): void {
  if (!pianoRoll.overlapOverlay) return;

  const g = pianoRoll.overlapOverlay;
  g.clear();

  if (!overlaps || overlaps.length === 0) return;

  const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;
  const pxPerSec = pianoRoll.timeScale(1) * pianoRoll.state.zoomX;

  overlaps.forEach(({ start, end }) => {
    const x = start * pxPerSec + pianoRoll.state.panX + pianoKeysOffset;
    const width = (end - start) * pxPerSec;
    if (width <= 0) return;

    g.rect(x, 0, width, pianoRoll.options.height);
    g.fill({ color, alpha });
  });
}
