/**
 * Format time in `MM:SS` format
 *
 * @param seconds - The number of seconds to format
 * @returns The formatted time string
 *
 * @example
 * ```ts
 * formatTime(60); // "01:00:00"
 * formatTime(60.5); // "01:00:30"
 * formatTime(120); // "02:00:00"
 * formatTime(120.5); // "02:00:30"
 * ```
 */
export function formatTime(seconds: number): string {
  // Handle NaN, null, undefined, and negative values
  if (!isFinite(seconds) || isNaN(seconds) || seconds == null) {
    return "00:00:00";
  }
  
  // Clamp negative values to 0 to avoid displaying "-00:00:00" in edge cases
  const safeSeconds = Math.max(0, seconds);

  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);

  // Display 2-digit centiseconds (hundredths of a second) so 0.3s → "30"
  const centiseconds = Math.floor(
    (safeSeconds - Math.floor(safeSeconds)) * 100
  );

  return `${minutes.toString().padStart(2, "0")}:${wholeSeconds
    .toString()
    .padStart(2, "0")}:${centiseconds.toString().padStart(2, "0")}`;
}
