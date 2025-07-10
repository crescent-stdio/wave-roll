import { NoteData } from "@/lib/midi/types";
import { PianoRollOptions, PianoRollInstance } from "./types";
import { PianoRoll } from "./piano-roll";

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
  options: PianoRollOptions = {}
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
    destroy: () => pianoRoll.destroy(),

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
  };
}

export { PianoRoll };
