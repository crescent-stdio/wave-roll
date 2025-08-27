import { PianoRoll } from "../piano-roll";
import { COLOR_PLAYHEAD, COLOR_PLAYHEAD_OUTLINE } from "@/lib/core/constants";

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

  const coreColor =
    pianoRoll.options.playheadColor ??
    parseInt(COLOR_PLAYHEAD.replace("#", ""), 16);
  const haloColor = parseInt(COLOR_PLAYHEAD_OUTLINE.replace("#", ""), 16);

  // Thicker dual-stroke vertical line (better visibility)
  pianoRoll.playheadLine.moveTo(playheadX, 0);
  pianoRoll.playheadLine.lineTo(playheadX, pianoRoll.options.height);
  pianoRoll.playheadLine.stroke({ width: 7, color: haloColor, alpha: 0.95 });
  pianoRoll.playheadLine.moveTo(playheadX, 0);
  pianoRoll.playheadLine.lineTo(playheadX, pianoRoll.options.height);
  pianoRoll.playheadLine.stroke({ width: 3, color: coreColor, alpha: 1 });

  // Add top/bottom ticks to help eye latch onto the playhead
  const tickHalf = 6; // px
  // Top tick (halo + core)
  pianoRoll.playheadLine.moveTo(playheadX - tickHalf - 1, 0);
  pianoRoll.playheadLine.lineTo(playheadX + tickHalf + 1, 0);
  pianoRoll.playheadLine.stroke({ width: 5, color: haloColor, alpha: 0.95 });
  pianoRoll.playheadLine.moveTo(playheadX - tickHalf, 0);
  pianoRoll.playheadLine.lineTo(playheadX + tickHalf, 0);
  pianoRoll.playheadLine.stroke({ width: 3, color: coreColor, alpha: 1 });
  // Bottom tick (halo + core)
  const h = pianoRoll.options.height;
  pianoRoll.playheadLine.moveTo(playheadX - tickHalf - 1, h);
  pianoRoll.playheadLine.lineTo(playheadX + tickHalf + 1, h);
  pianoRoll.playheadLine.stroke({ width: 5, color: haloColor, alpha: 0.95 });
  pianoRoll.playheadLine.moveTo(playheadX - tickHalf, h);
  pianoRoll.playheadLine.lineTo(playheadX + tickHalf, h);
  pianoRoll.playheadLine.stroke({ width: 3, color: coreColor, alpha: 1 });

  // Ensure playhead is visible and on top
  pianoRoll.playheadLine.visible = true;
  pianoRoll.playheadLine.zIndex = 1000;

  // Force container to re-sort children by zIndex
  pianoRoll.container.sortChildren();

  // console.log("[playhead]", {
  //   x: playheadX,
  //   phase: timeOffsetPx <= playheadX ? "moving" : "fixed",
  //   height: pianoRoll.options.height,
  //   currentTime: pianoRoll.state.currentTime,
  //   visible: pianoRoll.playheadLine.visible,
  //   color: "0xff0000",
  // });
}
