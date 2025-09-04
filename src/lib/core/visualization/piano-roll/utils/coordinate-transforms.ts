/**
 * Coordinate transformation utilities for piano roll visualization
 */

import type { PianoRoll } from '../piano-roll';

export interface CoordinateTransform {
  timeToPixel(time: number): number;
  pixelToTime(pixel: number): number;
  pitchToPixel(pitch: number): number;
  pixelToPitch(pixel: number): number;
  getPianoKeysOffset(): number;
  getPixelsPerSecond(): number;
}

/**
 * Create a coordinate transformer for a piano roll instance
 */
export function createCoordinateTransform(pianoRoll: PianoRoll): CoordinateTransform {
  return {
    /**
     * Convert time to pixel position
     */
    timeToPixel(time: number): number {
      const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;
      return pianoRoll.timeScale(time) * pianoRoll.state.zoomX + pianoKeysOffset;
    },

    /**
     * Convert pixel position to time
     */
    pixelToTime(pixel: number): number {
      const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;
      return pianoRoll.timeScale.invert((pixel - pianoKeysOffset) / pianoRoll.state.zoomX);
    },

    /**
     * Convert pitch to pixel position
     */
    pitchToPixel(pitch: number): number {
      return pianoRoll.pitchScale(pitch) * pianoRoll.state.zoomY;
    },

    /**
     * Convert pixel position to pitch
     */
    pixelToPitch(pixel: number): number {
      return pianoRoll.pitchScale.invert(pixel / pianoRoll.state.zoomY);
    },

    /**
     * Get the piano keys offset
     */
    getPianoKeysOffset(): number {
      return pianoRoll.options.showPianoKeys ? 60 : 0;
    },

    /**
     * Get pixels per second
     */
    getPixelsPerSecond(): number {
      return pianoRoll.timeScale(1) * pianoRoll.state.zoomX;
    }
  };
}

/**
 * Calculate visible time range in the viewport
 */
export interface ViewportBounds {
  timeStart: number;
  timeEnd: number;
  pixelStart: number;
  pixelEnd: number;
}

/**
 * Get the visible time range for the current viewport
 */
export function getVisibleTimeRange(pianoRoll: PianoRoll): ViewportBounds {
  const pianoKeysOffset = pianoRoll.options.showPianoKeys ? 60 : 0;
  const transform = createCoordinateTransform(pianoRoll);
  
  const timeStart = Math.max(
    0,
    pianoRoll.timeScale.invert(
      (-pianoRoll.state.panX - pianoKeysOffset) / pianoRoll.state.zoomX
    )
  );
  
  const timeEnd = Math.min(
    pianoRoll.timeScale.domain()[1],
    pianoRoll.timeScale.invert(
      (pianoRoll.options.width - pianoKeysOffset - pianoRoll.state.panX) / pianoRoll.state.zoomX
    )
  );
  
  return {
    timeStart,
    timeEnd,
    pixelStart: transform.timeToPixel(timeStart),
    pixelEnd: transform.timeToPixel(timeEnd)
  };
}

/**
 * Check if a time position is within the viewport
 */
export function isTimeInViewport(time: number, pianoRoll: PianoRoll): boolean {
  const bounds = getVisibleTimeRange(pianoRoll);
  return time >= bounds.timeStart && time <= bounds.timeEnd;
}

/**
 * Check if a pixel position is within the viewport
 */
export function isPixelInViewport(x: number, pianoRoll: PianoRoll, margin: number = 10): boolean {
  return x >= -margin && x <= pianoRoll.options.width + margin;
}