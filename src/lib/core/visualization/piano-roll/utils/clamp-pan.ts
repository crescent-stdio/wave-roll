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
