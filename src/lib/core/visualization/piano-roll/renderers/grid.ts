import * as PIXI from "pixi.js";
import { PianoRoll } from "../piano-roll";
import type { WaveRollAudioAPI } from "@/lib/core/waveform/types";
import { COLOR_LOOP_SHADE, COLOR_LOOP_LINE_A, COLOR_LOOP_LINE_B } from "@/lib/core/constants";
import { 
  createCoordinateTransform, 
  getVisibleTimeRange,
  DrawingPrimitives,
  ColorCalculator
} from "../utils";
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
  // Also clear waveform layer so it re-renders cleanly each frame
  if (pianoRoll.waveformLayer) {
    pianoRoll.waveformLayer.clear();
  }
  const pr = pianoRoll as PianoRoll & { waveformKeysLayer?: PIXI.Graphics };
  if (pr.waveformKeysLayer) {
    pr.waveformKeysLayer.clear();
  }

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

    // Draw subtle vertical separator at the edge between keys and timeline
    pianoRoll.backgroundGrid.moveTo(pianoKeysWidth + 0.5, 0);
    pianoRoll.backgroundGrid.lineTo(
      pianoKeysWidth + 0.5,
      pianoRoll.options.height
    );
    pianoRoll.backgroundGrid.stroke({ width: 1, color: 0x999999, alpha: 0.6 });

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
  const transform = createCoordinateTransform(pianoRoll);
  const pixelsPerSecond = transform.getPixelsPerSecond();

  // Helper to draw vertical grid line
  const drawGridLine = (tVal: number, alpha: number, showLabel: boolean) => {
    const x = transform.timeToPixel(tVal) + pianoRoll.state.panX;

    // Only draw if line is within viewport
    if (x < -10 || x > pianoRoll.options.width + 10) {
      return;
    }

    DrawingPrimitives.drawVerticalLine(
      pianoRoll.backgroundGrid,
      x,
      pianoRoll.options.height,
      { width: 1, color: 0xe0e0e0, alpha }
    );

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
    const x = transform.timeToPixel(t) + pianoRoll.state.panX;

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
    const pianoKeysOffset = transform.getPianoKeysOffset();
    let lineWidth = 3; // thicker for better visibility

    const drawDashed = (
      g: PIXI.Graphics,
      x: number,
      color: number,
      segLen = 10,
      gapLen = 6
    ) => {
      // Draw alternating segments from top to bottom
      let y = 0;
      while (y < pianoRoll.options.height) {
        const y2 = Math.min(y + segLen, pianoRoll.options.height);
        // Halo
        g.moveTo(x, y);
        g.lineTo(x, y2);
        g.stroke({ width: lineWidth + 2, color: 0xffffff, alpha: 0.95 });
        // Core
        g.moveTo(x, y);
        g.lineTo(x, y2);
        g.stroke({ width: lineWidth, color, alpha: 1 });
        y = y2 + gapLen;
      }
    };

    // Helper to draw a single vertical line + label
    const drawLine = (
      g: PIXI.Graphics,
      x: number,
      color: number,
      label: string
    ) => {
      // Default: solid line with halo (not dashed)
      g.moveTo(x, 0);
      g.lineTo(x, pianoRoll.options.height);
      g.stroke({ width: lineWidth + 2, color: 0xffffff, alpha: 0.95 });
      g.moveTo(x, 0);
      g.lineTo(x, pianoRoll.options.height);
      g.stroke({ width: lineWidth, color, alpha: 1 });

      const text = new PIXI.Text({
        text: label,
        style: {
          fontSize: 11,
          fill: color,
          align: "center",
        },
      });
      text.x = x + 2;
      text.y = 0;
      pianoRoll.loopLabelContainer.addChild(text);
    };

    let startX: number | null = null;
    let endX: number | null = null;

    if (pianoRoll.loopStart !== null) {
      startX = transform.timeToPixel(pianoRoll.loopStart) + pianoRoll.state.panX;

      // A-line: longer dashes
      const colA = ColorCalculator.hexToNumber(COLOR_LOOP_LINE_A);
      drawDashed(pianoRoll.loopLines.start, startX!, colA, 14, 8);
      drawLine(pianoRoll.loopLines.start, startX!, colA, `A(${pianoRoll.loopStart.toFixed(1)}s)`);
    }

    if (pianoRoll.loopEnd !== null) {
      endX = transform.timeToPixel(pianoRoll.loopEnd) + pianoRoll.state.panX;

      // B-line: denser short dashes (dotted look)
      const colB = ColorCalculator.hexToNumber(COLOR_LOOP_LINE_B);
      drawDashed(pianoRoll.loopLines.end, endX!, colB, 2, 4);
      drawLine(pianoRoll.loopLines.end, endX!, colB, `B(${pianoRoll.loopEnd.toFixed(1)}s)`);
    }

    // Draw translucent overlay only when both points are defined
    if (startX !== null && endX !== null) {
      const overlayColor = ColorCalculator.hexToNumber(COLOR_LOOP_SHADE);
      DrawingPrimitives.drawRectangle(
        pianoRoll.loopOverlay,
        {
          x: startX,
          y: 0,
          width: Math.max(0, endX - startX),
          height: pianoRoll.options.height
        },
        { color: overlayColor, alpha: 0.22 }
      );
    }
  }

  // drawOverlapRegions disabled - overlap now indicated via note tinting

  // -------------------------------------------------------------
  // Waveform overlay (if available)
  // Draw on the dedicated waveformLayer so it stays beneath the grid.
  // A lightweight visualization: vertical min/max bars per peak column mapped to time.
  // Render as a bottom band so it appears "below" the piano-roll grid content while
  // remaining synchronized with pan/zoom.
  // Skip waveform rendering if showWaveformBand is disabled
  if (pianoRoll.options.showWaveformBand === false) {
    // Clear any existing waveform graphics
    pianoRoll.waveformLayer?.clear();
    pr.waveformKeysLayer?.clear();
  } else try {
    const api = (globalThis as unknown as { _waveRollAudio?: WaveRollAudioAPI })._waveRollAudio;
    if (api?.getVisiblePeaks) {
      const peaksPayload = api.getVisiblePeaks();
      if (peaksPayload && peaksPayload.length > 0) {
        const pianoKeysOffset = transform.getPianoKeysOffset();
        const height = pianoRoll.options.height;

        // To avoid overdraw, sample at most one bar per pixel
        const pixelsPerSecond = transform.getPixelsPerSecond();
        const secondsPerPixel = 1 / pixelsPerSecond;

        // Clear previous waveform drawing
        pianoRoll.waveformLayer.clear();
        if (pr.waveformKeysLayer) {
          pr.waveformKeysLayer.clear();
        }

        // Compute visible time range based on current pan/zoom
        const visibleRange = getVisibleTimeRange(pianoRoll);
        const t0 = visibleRange.timeStart;
        const t1 = visibleRange.timeEnd;

        // Choose step ~ 1px in time
        const step = Math.max(secondsPerPixel, 0.005);

        // Bottom band placement
        const bandPadding = 0; // px – fill to bottom edge as requested
        const bandHeight = Math.max(
          24,
          Math.min(96, Math.floor(height * 0.22))
        );
        const bandTop = height - bandHeight - bandPadding;
        const bandMidY = bandTop + bandHeight * 0.5;

        // Draw a subtle horizontal separator between piano-roll grid and waveform band
        pianoRoll.backgroundGrid.moveTo(0, bandTop - 1);
        pianoRoll.backgroundGrid.lineTo(pianoRoll.options.width, bandTop - 1);
        pianoRoll.backgroundGrid.stroke({
          width: 1,
          color: 0x999999,
          alpha: 0.5,
        });

        // Fill a faint background for the waveform band to visually separate it
        pianoRoll.waveformLayer.rect(
          pianoKeysOffset,
          bandTop,
          Math.max(0, pianoRoll.options.width - pianoKeysOffset),
          bandHeight
        );
        pianoRoll.waveformLayer.fill({ color: 0x000000, alpha: 0.04 });

        for (let t = t0; t <= t1; t += step) {
          const x = transform.timeToPixel(t) + pianoRoll.state.panX;

          const p = api.sampleAtTime ? api.sampleAtTime(t) : null; // returns { min: number, max: number, color: number }
          if (!p) continue;
          // Use symmetric amplitude around midline for a canonical waveform look
          const amp = Math.max(
            Math.max(0, Math.min(1, p.max)),
            Math.max(0, Math.min(1, p.min))
          );
          const halfH = bandHeight * 0.5 * amp;

          pianoRoll.waveformLayer.moveTo(x, bandMidY - halfH);
          pianoRoll.waveformLayer.lineTo(x, bandMidY + halfH);
          pianoRoll.waveformLayer.stroke({
            width: 1,
            color: p.color ?? 0x475569, /* slate-600 for neutral, accessible contrast */
            alpha: 0.8,
          });
        }

        // Also draw the same-scale waveform inside the piano-keys column (left of playhead)
        if (
          pianoRoll.options.showPianoKeys &&
          pr.waveformKeysLayer
        ) {
          const keysLayer = pr.waveformKeysLayer as PIXI.Graphics;
          // Use identical dimensions as the main bottom waveform band for seamless continuity
          const keysBandHeight = bandHeight;
          const keysBandTop = bandTop;
          const keysBandMidY = bandMidY;

          // Fill a subtle background behind keys waveform to improve contrast
          keysLayer.rect(
            0,
            keysBandTop,
            Math.max(0, pianoRoll.playheadX),
            keysBandHeight
          );
          // pianoRoll.waveformLayer.rect(
          //   pianoKeysOffset,
          //   bandTop,
          //   Math.max(0, pianoRoll.options.width - pianoKeysOffset),
          //   bandHeight
          // );
          keysLayer.fill({ color: 0x000000, alpha: 0.04 });

          // Compute time range that maps to the keys area [0, playheadX)
          const tKeys0 = Math.max(
            0,
            pianoRoll.timeScale.invert(
              (0 - pianoKeysOffset - pianoRoll.state.panX) /
                pianoRoll.state.zoomX
            )
          );
          const tKeys1 = Math.min(
            pianoRoll.timeScale.domain()[1],
            pianoRoll.timeScale.invert(
              (pianoRoll.playheadX - pianoKeysOffset - pianoRoll.state.panX) /
                pianoRoll.state.zoomX
            )
          );

          for (let t = tKeys0; t <= tKeys1; t += step) {
            const xKeys = transform.timeToPixel(t) + pianoRoll.state.panX;

            if (xKeys < 0 || xKeys >= pianoRoll.playheadX) continue;

            const p = api.sampleAtTime ? api.sampleAtTime(t) : null;
            if (!p) continue;
            // Symmetric amplitude for the compact keys waveform as well
            const amp = Math.max(
              Math.max(0, Math.min(1, p.max)),
              Math.max(0, Math.min(1, p.min))
            );
            const halfH = keysBandHeight * 0.5 * amp;

            keysLayer.moveTo(xKeys, keysBandMidY - halfH);
            keysLayer.lineTo(xKeys, keysBandMidY + halfH);
            keysLayer.stroke({
              width: 1,
              color: p.color ?? 0x475569,
              alpha: 0.8,
            });
          }
        }
      }
    }
  } catch (_err) {
    // Ignore waveform errors to keep grid robust
  }
}
