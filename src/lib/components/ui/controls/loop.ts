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
  const { element } = createCoreLoopControls({
    audioPlayer: deps.audioPlayer,
    pianoRoll: deps.pianoRoll,
  });

  // The core loop controls' updateSeekBar() dispatches 'wr-loop-update' event
  // which is handled by player.ts to update the seekbar overlay.
  // We don't chain deps.updateSeekBar here to avoid infinite recursion,
  // as the update loop already calls deps.updateSeekBar directly.

  return element;
}
