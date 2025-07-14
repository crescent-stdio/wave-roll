import { PianoRollViewState } from "../types";

export function createDefaultState(): PianoRollViewState {
  return {
    zoomX: 1,
    zoomY: 1,
    panX: 0,
    panY: 0,
    currentTime: 0,
    isPanning: false,
    lastPointerPos: { x: 0, y: 0 },
  };
}

/** Set zoom level on X axis */
export function setZoomX(state: PianoRollViewState, zoom: number) {
  state.zoomX = Math.max(0.1, Math.min(10, zoom));
}

/** Pan on X axis */
export function panX(state: PianoRollViewState, delta: number) {
  state.panX += delta;
}

/** Set current time */
export function setCurrentTime(state: PianoRollViewState, time: number) {
  state.currentTime = Math.max(0, time);
}

/** Begin panning */
export function beginPan(state: PianoRollViewState, x: number, y: number) {
  state.isPanning = true;
  state.lastPointerPos = { x, y };
}

/** End panning */
export function endPan(state: PianoRollViewState) {
  state.isPanning = false;
}

export const selectZoomX = (s: PianoRollViewState) => s.zoomX;
export const selectPanX = (s: PianoRollViewState) => s.panX;
export const selectCurrentTime = (s: PianoRollViewState) => s.currentTime;

/** The actual time that the fixed playhead is looking at */
export function selectTimeAtPlayhead(
  s: PianoRollViewState,
  pxPerSecond: number,
  pianoKeysOffset = 60
) {
  return Math.max(0, (-s.panX + pianoKeysOffset) / (pxPerSecond * s.zoomX));
}
