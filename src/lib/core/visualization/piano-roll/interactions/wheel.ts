import { PianoRoll } from "../piano-roll";

export function onWheel(event: WheelEvent, pianoRoll: PianoRoll): void {
  event.preventDefault();

  const zoomFactor = 1.1;
  const deltaY = event.deltaY;

  // Use cursor position as anchor only when user holds Ctrl/Cmd (precision zoom).
  // Otherwise anchor to playhead so that the current playback point stays fixed.
  const usePointerAnchor = event.ctrlKey || event.metaKey;
  const anchorX = usePointerAnchor ? event.offsetX : undefined;

  if (deltaY < 0) {
    pianoRoll.zoomX(zoomFactor, anchorX);
  } else {
    pianoRoll.zoomX(1 / zoomFactor, anchorX);
  }
}
