/**
 * Format time in `MM:SS` format
 *
 * @param seconds - The number of seconds to format
 * @returns The formatted time string
 *
 * @example
 * ```ts
 * formatTime(60); // "01:00"
 * formatTime(120); // "02:00"
 * formatTime(120.5); // "02:00"
 * ```
 */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}
