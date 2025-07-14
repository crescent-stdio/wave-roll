import { UIComponentDependencies } from "../types";
import { createCoreLoopControls } from "@/core/controls";

/**
 * UI wrapper around the core loop controls to avoid code duplication.
 * Binds the core `updateSeekBar` helper back into the shared UI dependencies
 * object so that other components (e.g. time display, seek bar) can reuse it.
 */
export function createLoopControlsUI(
  deps: UIComponentDependencies
): HTMLElement {
  if (!deps.audioPlayer || !deps.pianoRoll) {
    throw new Error("Audio player and piano roll are required");
  }
  const { element, updateSeekBar } = createCoreLoopControls({
    audioPlayer: deps.audioPlayer,
    pianoRoll: deps.pianoRoll,
  });

  // Expose the helper to the rest of the UI so components stay in sync.
  deps.updateSeekBar = updateSeekBar;

  return element;
}
