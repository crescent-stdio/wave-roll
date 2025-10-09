import { PianoRoll } from "../piano-roll";
import { clampPanX } from "../utils/clamp-pan";

// Short-term mode latch to avoid rapid flip-flopping between pan and zoom
// on high-resolution trackpads where both deltaX and deltaY can fluctuate.
const wheelModeLatch = new WeakMap<PianoRoll, { mode: "pan" | "zoom"; expiresAt: number }>();

export function onWheel(event: WheelEvent, pianoRoll: PianoRoll): void {
  event.preventDefault();

  const zoomFactor = 1.1;
  const deltaY = event.deltaY;
  const deltaX = event.deltaX;

  // Always use cursor position (clientX - canvas.left) as the zoom anchor for
  // more stable cross-browser behavior than relying on offsetX for WheelEvent.
  // Clamp to the timeline area (exclude the piano-keys gutter) so zooms in the
  // keys column still feel anchored to the playhead edge.
  const rect = pianoRoll.app.canvas.getBoundingClientRect();
  const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;
  
  // Detect trackpad pinch gesture: ctrlKey without other modifiers and no significant horizontal delta
  const isPinchGesture = event.ctrlKey && !event.altKey && !event.shiftKey && Math.abs(deltaX) < 2;
  
  let anchorX: number;
  if (isPinchGesture && typeof (event as any).offsetX === 'number' && (event as any).offsetX > 0) {
    // For trackpad pinch, use offsetX when available (some browsers provide pinch center)
    anchorX = Math.max(pianoKeysOffset, Math.min(pianoRoll.options.width, (event as any).offsetX));
  } else {
    // For mouse wheel or when offsetX unavailable, use cursor position
    const rawAnchor = (event as MouseEvent).clientX - rect.left;
    anchorX = Math.max(
      pianoKeysOffset,
      Math.min(
        pianoRoll.options.width,
        Number.isFinite(rawAnchor) ? (rawAnchor as number) : pianoKeysOffset
      )
    );
  }

  // Alt/Option + wheel => vertical (pitch) zoom for intuitive interaction
  if (event.altKey) {
    if (deltaY < 0) {
      pianoRoll.zoomY(zoomFactor);
    } else {
      pianoRoll.zoomY(1 / zoomFactor);
    }
    return;
  }

  // Decide between pan and zoom with hysteresis to reduce mode flicker.
  const now = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  const latched = wheelModeLatch.get(pianoRoll);

  // Modifier keys:
  // - Alt => vertical zoom (handled above)
  // - Shift => force horizontal pan (and map vertical wheel to horizontal if needed)
  // - Ctrl/Cmd => force zoom
  const shiftForcesPan = event.shiftKey === true;
  const ctrlOrCmdForcesZoom = event.ctrlKey === true || event.metaKey === true;

  // Heuristic dominance with a forgiving threshold to prefer pan when user moves mostly horizontally
  const horizontalDominant = Math.abs(deltaX) >= Math.abs(deltaY) * 0.8;
  let mode: "pan" | "zoom";

  if (shiftForcesPan) {
    mode = "pan";
  } else if (ctrlOrCmdForcesZoom) {
    mode = "zoom";
  } else if (latched && now < latched.expiresAt) {
    mode = latched.mode;
  } else {
    mode = horizontalDominant ? "pan" : "zoom";
    wheelModeLatch.set(pianoRoll, { mode, expiresAt: now + 120 });
  }

  if (mode === "pan") {
    // Horizontal pan. If Shift is held and horizontal delta is tiny, map vertical motion to horizontal.
    let dx = deltaX;
    if (shiftForcesPan && Math.abs(dx) < 0.5) {
      dx = deltaY;
    }
    // Map wheel direction to timeline movement: scroll right -> later time (content moves left)
    pianoRoll.state.panX -= dx;
    clampPanX(pianoRoll.timeScale, pianoRoll.state);
    // Keep UI in sync with new time under playhead
    pianoRoll.state.currentTime = pianoRoll.computeTimeAtPlayhead();
    if (pianoRoll.onTimeChangeCallback) {
      pianoRoll.onTimeChangeCallback(pianoRoll.state.currentTime);
    }
    pianoRoll.requestRender();
    return;
  }

  // Zoom mode: use appropriate anchor point
  if (deltaY < 0) {
    pianoRoll.zoomX(zoomFactor, anchorX);
  } else {
    pianoRoll.zoomX(1 / zoomFactor, anchorX);
  }
}
