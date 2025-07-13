/**
 * Generate a time-sortable, globally-unique ID.
 * @param prefix - Prefix for the ID.
 * @returns A time-sortable, globally-unique ID.
 */
export function generateUniqueId(prefix = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate a globally‑unique ID for a MIDI file entry.
 * Pattern: `midi-<unixMs>-<randomBase36>`
 *
 * @returns A globally‑unique ID for a MIDI file entry.
 * @example
 * ```typescript
 * const id = generateMidiFileId();
 * // console.log(id); // "midi-1715235600-1234567890"
 * ```
 */
export const generateMidiFileId = () => generateUniqueId("midi");

/**
 * Generate a globally‑unique ID for a core file entry.
 * Pattern: `core-<fileName>-<unixMs>-<randomBase36>`
 *
 * @param fileName - The name of the file.
 * @returns A globally‑unique ID for a core file entry.
 * @example
 * ```typescript
 * const id = generateCoreFileId("test.mid");
 * // console.log(id); // "core-test-1715235600-1234567890"
 * ```
 */
export const generateCoreFileId = (fileName: string) =>
  generateUniqueId(fileName.replace(/\.[^/.]+$/, ""));
