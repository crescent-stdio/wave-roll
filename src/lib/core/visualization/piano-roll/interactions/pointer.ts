import * as PIXI from "pixi.js";
import { PianoRoll } from "../piano-roll";
import { clampPanX, clampPanY } from "../utils/clamp-pan";

export function onPointerDown(
  event: MouseEvent | TouchEvent,
  pianoRoll: PianoRoll
): void {
  event.preventDefault();

  const pos = getPointerPosition(event, pianoRoll.app);
  pianoRoll.state.isPanning = true;
  pianoRoll.state.lastPointerPos = pos;
}

export function onPointerMove(
  event: MouseEvent | TouchEvent,
  pianoRoll: PianoRoll
): void {
  if (!pianoRoll.state.isPanning) return;

  event.preventDefault();
  const pos = getPointerPosition(event, pianoRoll.app);
  const deltaX = pos.x - pianoRoll.state.lastPointerPos.x;
  const deltaY = pos.y - pianoRoll.state.lastPointerPos.y;

  const altPressed = (event as MouseEvent).altKey === true;

  if (altPressed) {
    // Only vertical panning when Alt/Option is held.
    pianoRoll.state.panY += deltaY;
    clampPanY(pianoRoll.pitchScale, pianoRoll.state, pianoRoll.options.height);
  } else {
    // Regular drag → horizontal panning only.
    pianoRoll.state.panX += deltaX;
    clampPanX(pianoRoll.timeScale, pianoRoll.state);
  }

  pianoRoll.state.lastPointerPos = pos;

  // Update currentTime based on new panX so external UI can stay in sync.
  pianoRoll.state.currentTime = pianoRoll.computeTimeAtPlayhead();
  if (pianoRoll.onTimeChangeCallback) {
    pianoRoll.onTimeChangeCallback(pianoRoll.state.currentTime);
  }

  pianoRoll.requestRender();
}

export function onPointerUp(
  event: MouseEvent | TouchEvent,
  pianoRoll: PianoRoll
): void {
  pianoRoll.state.isPanning = false;
}

export function getPointerPosition(
  event: MouseEvent | TouchEvent,
  app: PIXI.Application
): {
  x: number;
  y: number;
} {
  const canvas = app.canvas;
  const rect = canvas.getBoundingClientRect();

  let clientX: number, clientY: number;

  if (event instanceof TouchEvent && event.touches.length > 0) {
    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else if (event instanceof MouseEvent) {
    clientX = event.clientX;
    clientY = event.clientY;
  } else {
    return { x: 0, y: 0 };
  }

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}
