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
  // Compute the total content height after applying vertical zoom.
  const range = pitchScale.range();
  const contentHeight = Math.abs(range[1] - range[0]) * state.zoomY;

  // When content fits within viewport, lock panY to 0 so the view stays centred.
  if (contentHeight <= viewportHeight) {
    state.panY = 0;
    return;
  }

  // Allow scrolling between top and bottom extremes.
  const maxPanY = 0; // Top-most position (content aligned with top edge)
  const minPanY = viewportHeight - contentHeight; // Bottom-most (negative) value
  state.panY = clamp(state.panY, minPanY, maxPanY);
}
