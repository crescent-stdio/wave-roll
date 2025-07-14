/**
 * Time + progress bar updater for PlayerDemo.
 * Keeps DOM elements in sync with the AudioPlayer state.
 */

export interface ProgressDisplayRefs {
  /** HH:MM label showing the current playback time. */
  currentLabel?: HTMLElement | null;
  /** HH:MM label showing the total duration. */
  totalLabel?: HTMLElement | null;
  /** Filled bar element indicating progress (width%). */
  progressBar?: HTMLElement | null;
  /** Draggable circle / square handle that follows progress. */
  seekHandle?: HTMLElement | null;
  /** Small triangle indicator above the bar. */
  progressIndicator?: HTMLElement | null;
  /** Function returning whether the user is currently dragging. */
  seeking?: () => boolean;
  /** Converts seconds → HH:MM string (injected by caller). */
  formatTime: (seconds: number) => string;
}

export interface ProgressState {
  currentTime: number;
  duration: number;
}

/**
 * Update labels + bar/handle position.
 */
export function updateTimeDisplay(
  refs: ProgressDisplayRefs,
  state: ProgressState
): void {
  const {
    currentLabel,
    totalLabel,
    progressBar,
    seekHandle,
    progressIndicator,
    seeking,
    formatTime,
  } = refs;

  /* --------------------------------------------------------------
   * Labels (HH:MM)
   * ------------------------------------------------------------ */
  currentLabel && (currentLabel.textContent = formatTime(state.currentTime));
  totalLabel && (totalLabel.textContent = formatTime(state.duration));

  /* --------------------------------------------------------------
   * Progress bar + handle - skip when user is dragging
   * ------------------------------------------------------------ */
  if (progressBar && !(seeking && seeking())) {
    const pct =
      state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
    progressBar.style.width = `${pct}%`;
    seekHandle && (seekHandle.style.left = `${pct}%`);
    progressIndicator && (progressIndicator.style.left = `${pct}%`);
  }
}
