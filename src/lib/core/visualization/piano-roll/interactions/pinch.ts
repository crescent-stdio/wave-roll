import type { PianoRoll } from "../piano-roll";

interface PinchState {
  isPinching: boolean;
  lastDistance: number;
  anchorX: number;
}

function getCanvasRect(pr: PianoRoll): DOMRect {
  return pr.app.canvas.getBoundingClientRect();
}

function distance(t0: Touch, t1: Touch): number {
  const dx = t0.clientX - t1.clientX;
  const dy = t0.clientY - t1.clientY;
  return Math.hypot(dx, dy);
}

function midpointX(t0: Touch, t1: Touch): number {
  return (t0.clientX + t1.clientX) / 2;
}

export function pinchStart(ev: TouchEvent, pr: PianoRoll, state: PinchState): void {
  if (ev.touches.length < 2) return;
  const t0 = ev.touches[0];
  const t1 = ev.touches[1];
  const rect = getCanvasRect(pr);
  state.isPinching = true;
  state.lastDistance = distance(t0, t1);
  const midX = midpointX(t0, t1);
  state.anchorX = Math.max(0, Math.min(pr.options.width, midX - rect.left));
}

export function pinchMove(ev: TouchEvent, pr: PianoRoll, state: PinchState): void {
  if (!state.isPinching || ev.touches.length < 2) return;
  ev.preventDefault();
  const t0 = ev.touches[0];
  const t1 = ev.touches[1];
  const d = distance(t0, t1);
  if (state.lastDistance <= 0) {
    state.lastDistance = d;
    return;
  }
  const rawFactor = d / state.lastDistance;
  // Dead-zone to reduce jitter
  if (Math.abs(rawFactor - 1) < 0.01) return;
  // Clamp step to avoid huge jumps
  const factor = Math.max(0.8, Math.min(1.25, rawFactor));
  pr.zoomX(factor, state.anchorX);
  state.lastDistance = d;
}

export function pinchEnd(ev: TouchEvent, _pr: PianoRoll, state: PinchState): void {
  if (ev.touches.length < 2) {
    state.isPinching = false;
  }
}


