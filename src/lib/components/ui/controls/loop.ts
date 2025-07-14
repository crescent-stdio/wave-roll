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

  // Preserve any existing seek-bar updater so we can chain both updates.
  const originalUpdateSeekBar = deps.updateSeekBar;

  // Expose a wrapper that forwards to the previous handler (progress / time
  // labels) *and* triggers the loop-overlay refresh coming from the core A-B
  // controls.  This avoids accidentally overriding the seek-bar sync logic,
  // which previously prevented the loop markers from showing up.
  deps.updateSeekBar = (state?: { currentTime: number; duration: number }) => {
    // 1) Trigger core loop-controls refresh & event dispatch.
    updateSeekBar();

    // 2) Now update the main seek-bar/time display with the latest loopWindow
    //    already stored by the playerʼs «wr-loop-update» handler.
    originalUpdateSeekBar?.(state);
  };

  return element;
}
