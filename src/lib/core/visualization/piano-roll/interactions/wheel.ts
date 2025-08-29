import { PianoRoll } from "../piano-roll";
import { clampPanX } from "../utils/clamp-pan";

export function onWheel(event: WheelEvent, pianoRoll: PianoRoll): void {
  event.preventDefault();

  const zoomFactor = 1.1;
  const deltaY = event.deltaY;
  const deltaX = event.deltaX;

  // Use cursor position as anchor only when user holds Ctrl/Cmd (precision zoom).
  // Otherwise anchor to playhead so that the current playback point stays fixed.
  const usePointerAnchor = event.ctrlKey || event.metaKey;
  const anchorX = usePointerAnchor ? event.offsetX : undefined;

  // Alt/Option + wheel => vertical (pitch) zoom for intuitive interaction
  if (event.altKey) {
    if (deltaY < 0) {
      pianoRoll.zoomY(zoomFactor);
    } else {
      pianoRoll.zoomY(1 / zoomFactor);
    }
    return;
  }

  // Shift or explicit horizontal scroll gesture => horizontal pan (x-scroll)
  const preferPan = event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY);
  if (preferPan) {
    // Use whichever axis has the dominant delta; if Shift is held, map vertical to horizontal.
    const dx = Math.abs(deltaX) > 0.5 ? deltaX : deltaY;
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

  // Ctrl/Cmd => precision zoom around cursor; otherwise zoom around playhead
  // Default: zoomX (horizontal time zoom)
  if (deltaY < 0) {
    pianoRoll.zoomX(zoomFactor, anchorX);
  } else {
    pianoRoll.zoomX(1 / zoomFactor, anchorX);
  }
}
