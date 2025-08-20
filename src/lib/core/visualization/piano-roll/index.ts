import { NoteData, ControlChangeEvent } from "@/lib/midi/types";
import { PianoRollConfig, PianoRollInstance } from "./types";
import { PianoRoll } from "./piano-roll";
import { NoteInterval } from "@/lib/core/controls/utils/overlap";
export type { PianoRollConfig, PianoRollInstance };

/**
 * Factory function to create a piano roll visualizer
 * @param container - HTML element to attach the canvas to
 * @param notes - Array of note data to visualize
 * @param options - Configuration options
 * @returns Piano roll instance and control methods
 */
export async function createPianoRoll(
  container: HTMLElement,
  notes: NoteData[] = [],
  options: PianoRollConfig = {}
): Promise<PianoRollInstance> {
  // Create canvas element
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  // Clear container and add canvas
  container.innerHTML = "";
  container.appendChild(canvas);

  // Create piano roll instance
  const pianoRoll = await PianoRoll.create(canvas, options);

  /* -----------------------------------------------------------
   * Keep PixiJS renderer in sync with container size.
   * In some layouts the parent element width is 0 when
   * createPianoRoll() runs (e.g. inside a still-hidden tab).
   * When the element becomes visible its width grows, but the
   * internal px/second scale was already cached - resulting in
   * almost-static scrolling (≈0.4 px/s in your logs).
   *
   * We attach a ResizeObserver so that the PianoRoll recalculates
   * its scales whenever the container resizes after first paint.
   * ----------------------------------------------------------- */

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        pianoRoll.resize(Math.floor(width), Math.floor(height));
      }
    }
  });

  // Observe the immediate parent <div> that wraps the canvas so we
  // capture both initial display and any subsequent window resizes.
  resizeObserver.observe(container);

  // Set initial notes
  if (notes.length > 0) {
    pianoRoll.setNotes(notes);
  }

  // Return control interface
  return {
    /**
     * Update the notes being displayed
     */
    setNotes: (newNotes: NoteData[]) => pianoRoll.setNotes(newNotes),

    /**
     * Update control-change events (e.g., sustain pedal)
     */
    setControlChanges: (cc: ControlChangeEvent[]) =>
      pianoRoll.setControlChanges(cc),

    /**
     * Update current playback time
     */
    setTime: (time: number) => pianoRoll.setTime(time),

    /**
     * Zoom in/out on time axis
     */
    zoomX: (factor: number) => pianoRoll.zoomX(factor),

    /**
     * Zoom in/out on pitch axis
     */
    zoomY: (factor: number) => pianoRoll.zoomY(factor),

    /**
     * Pan the view
     */
    pan: (deltaX: number, deltaY: number) => pianoRoll.pan(deltaX, deltaY),

    /**
     * Reset view to default zoom and pan
     */
    resetView: () => pianoRoll.resetView(),

    /**
     * Get current state for debugging
     */
    getState: () => pianoRoll.getState(),

    /**
     * Clean up resources
     */
    destroy: () => {
      resizeObserver.disconnect();
      pianoRoll.destroy();
    },

    /**
     * Update timeStep (grid spacing in seconds)
     */
    setTimeStep: (step: number) => pianoRoll.setTimeStep(step),

    /**
     * Get current timeStep
     */
    getTimeStep: () => pianoRoll.getTimeStep(),

    /**
     * Update loop window markers (A-B)
     */
    setLoopWindow: (start: number | null, end: number | null) =>
      pianoRoll.setLoopWindow(start, end),

    /**
     * Register callback for time changes due to panning/zooming
     */
    onTimeChange: (callback: (time: number) => void) =>
      pianoRoll.onTimeChange(callback),

    /**
     * Update minor grid step and re-render
     */
    setMinorTimeStep: (step: number) => pianoRoll.setMinorTimeStep(step),

    /**
     * Get current minor timeStep
     */
    getMinorTimeStep: () => pianoRoll.getMinorTimeStep(),

    /** Update overlap highlight bars */
    setOverlapRegions: (ov: NoteInterval[]) =>
      (pianoRoll as any).setOverlapRegions?.(ov),

    /** Resize the PixiJS renderer */
    resize: (width: number, height?: number) => pianoRoll.resize(width, height),
    
    /**
     * Get the underlying PianoRoll instance for direct access
     * This is needed for setting internal properties like fileInfoMap
     */
    _instance: pianoRoll,
  };
}

export { PianoRoll };
