import { PianoRoll } from "../piano-roll";

export function renderPlayhead(pianoRoll: PianoRoll): void {
  pianoRoll.playheadLine.clear();

  const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;
  const pxPerSecond = pianoRoll.timeScale(1) * pianoRoll.state.zoomX;
  const timeOffsetPx = pianoRoll.state.currentTime * pxPerSecond;

  // Calculate playhead position based on current phase
  // const playheadX = timeOffsetPx + pianoKeysOffset;
  const playheadX = pianoKeysOffset;
  pianoRoll.playheadX = playheadX;

  // Draw a thicker, more visible red line
  pianoRoll.playheadLine.moveTo(playheadX, 0);
  pianoRoll.playheadLine.lineTo(playheadX, pianoRoll.options.height);
  pianoRoll.playheadLine.stroke({ width: 3, color: 0xff0000, alpha: 0.7 }); // Red color, full opacity, 3px width

  // Ensure playhead is visible and on top
  pianoRoll.playheadLine.visible = true;
  pianoRoll.playheadLine.zIndex = 1000;

  // Force container to re-sort children by zIndex
  pianoRoll.container.sortChildren();

  // console.debug("[playhead]", {
  //   x: playheadX,
  //   phase: timeOffsetPx <= playheadFixedPosition ? "moving" : "fixed",
  //   height: this.options.height,
  //   currentTime: this.state.currentTime,
  //   visible: this.playheadLine.visible,
  //   color: "0xff0000",
  // });
}
