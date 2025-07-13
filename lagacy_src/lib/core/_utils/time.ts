/**
 * Convert seconds to `MM:SS` format.
 *
 * @param seconds - The number of seconds to convert.
 * @returns The formatted time string. (e.g. "12:34")
 */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}
