export interface UpdateLoopHandle {
  /** Stop the internal `setInterval` loop. */
  stop(): void;
}

/**
 * Start a periodic update loop that calls the given `step` function.
 * The caller receives a small handle with a `stop()` method to cancel it.
 *
 * NOTE: This helper is intentionally generic so other components (e.g. sidebar
 * refresh) can reuse it without depending on the player implementation.
 */
export function startUpdateLoop(
  step: () => void,
  interval = 50
): UpdateLoopHandle {
  const id = window.setInterval(step, interval);
  return {
    stop: () => window.clearInterval(id),
  };
}
