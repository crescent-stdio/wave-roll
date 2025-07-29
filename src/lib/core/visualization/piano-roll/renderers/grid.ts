import * as PIXI from "pixi.js";
import { PianoRoll } from "../piano-roll";
// import { drawOverlapRegions } from "./overlaps"; // kept for future use

export function renderGrid(pianoRoll: PianoRoll): void {
  // Clear previous labels to avoid duplicates and stale objects
  if (pianoRoll.backgroundLabelContainer) {
    pianoRoll.backgroundLabelContainer.removeChildren();
  }
  if (pianoRoll.loopLabelContainer) {
    pianoRoll.loopLabelContainer.removeChildren();
  }

  // Remove any previously added children (e.g., text labels) and clear drawings
  pianoRoll.backgroundGrid.removeChildren();
  pianoRoll.backgroundGrid.clear();

  // Clear loop overlay & lines before redrawing
  pianoRoll.loopOverlay.clear();
  pianoRoll.loopOverlay.removeChildren();

  if (pianoRoll.loopLines) {
    // Reset geometry and children for the vertical A/B marker lines.
    pianoRoll.loopLines.start.clear();
    pianoRoll.loopLines.start.removeChildren();

    pianoRoll.loopLines.end.clear();
    pianoRoll.loopLines.end.removeChildren();
  }

  // (Overlap overlay disabled - coloring handled per-note)

  // Piano key background (if enabled)
  if (pianoRoll.options.showPianoKeys) {
    // const pianoKeysWidth = this.timeScale(1) * this.state.zoomX;
    const pianoKeysWidth = pianoRoll.playheadX;
    pianoRoll.backgroundGrid.rect(
      0,
      0,
      pianoKeysWidth,
      pianoRoll.options.height
    );
    pianoRoll.backgroundGrid.fill({ color: 0xf0f0f0 });

    // Draw piano key lines
    for (
      let midi = pianoRoll.options.noteRange.min;
      midi <= pianoRoll.options.noteRange.max;
      midi++
    ) {
      const yBase = pianoRoll.pitchScale(midi);
      const canvasMid = pianoRoll.options.height / 2;
      const y = (yBase - canvasMid) * pianoRoll.state.zoomY + canvasMid;
      // const isBlackKey = [1, 3, 6, 8, 10].includes(midi % 12);

      pianoRoll.backgroundGrid.moveTo(0, y);
      pianoRoll.backgroundGrid.lineTo(pianoKeysWidth, y);
      pianoRoll.backgroundGrid.stroke({
        width: 1,
        color: 0xcccccc,
        // color: isBlackKey ? 0x000000 : 0xcccccc,
        alpha: 0.3,
      });
    }
  }

  // Time grid lines (major & minor)
  const timeStep = pianoRoll.options.timeStep;
  const minorStep = pianoRoll.options.minorTimeStep;
  const maxTime = pianoRoll.timeScale.domain()[1];

  // Calculate minimum label spacing to prevent overlap
  const minLabelSpacing = 50; // pixels
  const pixelsPerSecond = pianoRoll.timeScale(1) * pianoRoll.state.zoomX;

  // Helper to draw vertical grid line
  const drawGridLine = (tVal: number, alpha: number, showLabel: boolean) => {
    const x =
      pianoRoll.timeScale(tVal) * pianoRoll.state.zoomX +
      pianoRoll.state.panX +
      (pianoRoll.options.showPianoKeys ? 60 : 0);

    // Only draw if line is within viewport
    if (x < -10 || x > pianoRoll.options.width + 10) {
      return;
    }

    pianoRoll.backgroundGrid.moveTo(x, 0);
    pianoRoll.backgroundGrid.lineTo(x, pianoRoll.options.height);
    pianoRoll.backgroundGrid.stroke({ width: 1, color: 0xe0e0e0, alpha });

    if (showLabel) {
      const label = new PIXI.Text({
        text: tVal.toFixed(1) + "s",
        style: {
          fontSize: 10,
          fill: 0x555555,
          align: "center",
        },
      });
      label.x = x + 2;
      label.y = pianoRoll.options.height - 14;
      pianoRoll.backgroundLabelContainer.addChild(label);
    }
  };

  // Major lines - only show labels at appropriate intervals
  let lastLabelX = -Infinity;
  for (let t = 0; t <= maxTime; t += timeStep) {
    const x =
      pianoRoll.timeScale(t) * pianoRoll.state.zoomX +
      pianoRoll.state.panX +
      (pianoRoll.options.showPianoKeys ? 60 : 0);

    // Show label only if there's enough space from the previous label
    const showLabel = x - lastLabelX >= minLabelSpacing;
    if (showLabel) {
      lastLabelX = x;
    }

    drawGridLine(t, 1.0, showLabel);
  }

  // Minor subdivision lines (draw after to appear underneath labels)
  if (minorStep && minorStep < timeStep) {
    const eps = minorStep / 1000; // tolerance for float comparisons
    for (let t = 0; t <= maxTime + eps; t += minorStep) {
      // skip if approximately a major line
      if (
        Math.abs(t % timeStep) < eps ||
        Math.abs(timeStep - (t % timeStep)) < eps
      ) {
        continue;
      }
      drawGridLine(t, 0.25, false);
    }
  }

  // -------------------------------------------------------------
  // Draw loop window highlight & marker lines
  //   • Individual A/B lines are shown if each point is set.
  //   • Shaded overlay is shown only when BOTH points exist.
  // -------------------------------------------------------------

  if (pianoRoll.loopLines) {
    const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;
    const lineWidth = 2;

    // Helper to draw a single vertical line + label
    const drawLine = (
      g: PIXI.Graphics,
      x: number,
      color: number,
      label: string
    ) => {
      g.moveTo(x, 0);
      g.lineTo(x, pianoRoll.options.height);
      g.stroke({ width: lineWidth, color, alpha: 0.9 });

      const text = new PIXI.Text({
        text: label,
        style: { fontSize: 10, fill: color, align: "center" },
      });
      text.x = x + 2;
      text.y = 0;
      pianoRoll.loopLabelContainer.addChild(text);
    };

    let startX: number | null = null;
    let endX: number | null = null;

    if (pianoRoll.loopStart !== null) {
      startX =
        pianoRoll.timeScale(pianoRoll.loopStart) * pianoRoll.state.zoomX +
        pianoRoll.state.panX +
        pianoKeysOffset;

      drawLine(
        pianoRoll.loopLines.start,
        startX!,
        0x00b894,
        pianoRoll.loopStart.toFixed(1) + "s"
      );
    }

    if (pianoRoll.loopEnd !== null) {
      endX =
        pianoRoll.timeScale(pianoRoll.loopEnd) * pianoRoll.state.zoomX +
        pianoRoll.state.panX +
        pianoKeysOffset;

      drawLine(
        pianoRoll.loopLines.end,
        endX!,
        0xff7f00,
        pianoRoll.loopEnd.toFixed(1) + "s"
      );
    }

    // Draw translucent overlay only when both points are defined
    if (startX !== null && endX !== null) {
      const overlayColor = 0xfff3cd; // light yellow
      pianoRoll.loopOverlay.rect(
        startX,
        0,
        Math.max(0, endX - startX),
        pianoRoll.options.height
      );
      pianoRoll.loopOverlay.fill({ color: overlayColor, alpha: 0.35 });
    }
  }

  // drawOverlapRegions disabled - overlap now indicated via note tinting
}
