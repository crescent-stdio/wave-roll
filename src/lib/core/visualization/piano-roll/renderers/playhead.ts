import { PianoRoll } from "../piano-roll";

export function renderPlayhead(pianoRoll: PianoRoll): void {
  // console.log(
  //   "[renderPlayhead] panX",
  //   pianoRoll.state.panX,
  //   "playheadX",
  //   pianoRoll.playheadX
  // );
  pianoRoll.playheadLine.clear();

  const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;
  const pxPerSecond = pianoRoll.timeScale(1) * pianoRoll.state.zoomX;
  const timeOffsetPx = pianoRoll.state.currentTime * pxPerSecond;

  // console.log(
  //   "%c[renderPlayhead] timeOffsetPx:",
  //   "color: blue; font-weight: bold;",
  //   timeOffsetPx
  // );
  // Keep playhead fixed right after the piano-keys column so the
  // underlying note layer scrolls while the playhead stays in place.
  const playheadX = pianoKeysOffset;
  // Optional debug: uncomment to let the playhead move with timeline
  // const playheadX = timeOffsetPx + pianoKeysOffset;
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
  //   phase: timeOffsetPx <= playheadX ? "moving" : "fixed",
  //   height: pianoRoll.options.height,
  //   currentTime: pianoRoll.state.currentTime,
  //   visible: pianoRoll.playheadLine.visible,
  //   color: "0xff0000",
  // });
}
