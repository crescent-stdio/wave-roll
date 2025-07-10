import { FileInputOptions, FileLoadOptions } from "./types";
import { FileManager } from "./file-manager";
/**
 * Create a file input element for file selection
 * @param options - Configuration options for the file input
 * @returns HTMLInputElement configured for MIDI file selection
 */
export function createFileInput(
  options: FileInputOptions = {}
): HTMLInputElement {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = options.accept || ".mid,.midi";
  fileInput.multiple = options.multiple || false;

  if (options.onFileSelect) {
    fileInput.addEventListener("change", (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        options.onFileSelect!(Array.from(files));
      }
    });
  }

  return fileInput;
}

/**
 * Handle file drop event
 * @param event - Drop event from drag and drop
 * @param options - Loading options
 * @returns Promise that resolves to loaded file IDs
 */
export async function handleFileDrop(
  fileManager: FileManager,
  event: DragEvent,
  options: FileLoadOptions = {}
): Promise<string[]> {
  event.preventDefault();

  const files = Array.from(event.dataTransfer?.files || []).filter(
    (file) =>
      file.name.toLowerCase().endsWith(".mid") ||
      file.name.toLowerCase().endsWith(".midi")
  );

  if (files.length === 0) {
    throw new Error("No valid MIDI files found in dropped items");
  }

  return fileManager.loadMultipleFiles(files, options);
}
