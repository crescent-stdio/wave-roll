/**
 * Validate file ID
 *
 * @param fileId - The file ID to validate
 * @returns `true` if the file ID is valid, `false` otherwise
 *
 * @example
 * ```ts
 * isValidFileId("123"); // true
 * isValidFileId(""); // false
 */
export function isValidFileId(fileId: string): boolean {
  return typeof fileId === "string" && fileId.length > 0;
}

/**
 * Check if a file is a valid MIDI file based on extension
 * @param file - File to check
 * @returns Whether the file has a valid MIDI extension
 */
export function isValidMidiFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".mid") || name.endsWith(".midi");
}

/**
 * Get file size in human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted file size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
