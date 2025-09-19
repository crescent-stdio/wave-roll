import { type ScaleLinear } from "d3-scale";
import { PianoRollViewState } from "../types";
import { clamp } from "@/core/utils";

export function clampPanX(
  timeScale: ScaleLinear<number, number>,
  state: PianoRollViewState
): void {
  const contentWidth = timeScale.range()[1] * state.zoomX;
  const minPanX = -contentWidth;

  const maxPanX = 0;
  state.panX = clamp(state.panX, minPanX, maxPanX);
}

export function clampPanY(
  pitchScale: ScaleLinear<number, number>,
  state: PianoRollViewState,
  viewportHeight: number
): void {
  // Derive reserved bottom band (waveform) from scale range definition used in createScales()
  const r = pitchScale.range();
  const reservedBottomPx = Math.max(0, viewportHeight - 20 - Math.max(r[0], r[1]));
  const usableHeight = viewportHeight - reservedBottomPx;

  // Compute scaled content extents around canvas mid, consistent with render() math
  const canvasMid = viewportHeight / 2;
  const d = pitchScale.domain();
  const midiMin = Math.min(d[0], d[1]);
  const midiMax = Math.max(d[0], d[1]);
  const yTopBase = pitchScale(midiMax);    // near ~20
  const yBottomBase = pitchScale(midiMin); // near ~(viewportHeight - 20 - reserved)
  const yTop = (yTopBase - canvasMid) * state.zoomY + canvasMid;
  const yBottom = (yBottomBase - canvasMid) * state.zoomY + canvasMid;

  // Clamp so that after applying panY, content stays within [0, usableHeight]
  const lowerBound = -yTop;                 // ensures top >= 0
  const upperBound = usableHeight - yBottom; // ensures bottom <= usableHeight
  const minPanY = Math.min(lowerBound, upperBound);
  const maxPanY = Math.max(lowerBound, upperBound);

  state.panY = clamp(state.panY, minPanY, maxPanY);
}
