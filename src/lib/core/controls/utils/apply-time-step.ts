/**
 * Validate and apply a new time step to the piano roll.
 *
 * @param pianoRoll - Object exposing `setTimeStep`.
 * @param value     - Proposed time-step in seconds.
 */
export function applyTimeStep(
  setTimeStep: ((v: number) => void) | undefined,
  value: number | string
): void {
  const v = parseFloat(value.toString());
  if (isNaN(v) || !Number.isFinite(v) || v <= 0 || !setTimeStep) return;
  setTimeStep?.(v);
}
