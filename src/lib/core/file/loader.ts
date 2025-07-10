import { parseMidi } from "../parsers/midi-parser";
import type { MidiInput } from "@/lib/midi/types";
import { DEFAULT_SAMPLE_FILES } from "./constants";
import { FileLoadOptions, SampleFileConfig } from "./types";
import { FileManager } from "./file-manager";

/**
 * Load sample MIDI files
 * @param fileManager - File manager instance
 * @param files - Array of file configurations to load, defaults to DEFAULT_SAMPLE_FILES
 * @returns Promise that resolves when all files are loaded
 */
export async function loadSampleFiles(
  fileManager: FileManager,
  files: SampleFileConfig[] = []
): Promise<void> {
  fileManager.isBatchLoading = true;

  const fileList = files.length > 0 ? files : DEFAULT_SAMPLE_FILES;

  for (const file of fileList) {
    try {
      const parsedData = await parseMidi(file.path);
      fileManager.midiManager.addMidiFile(
        file.path,
        parsedData,
        file.displayName
      );
    } catch (error) {
      console.error(`Failed to load ${file.path}:`, error);
    }
  }

  fileManager.isBatchLoading = false;
}

/**
 * Load a single MIDI file
 * @param fileManager - File manager instance
 * @param input - File input (File object or URL string)
 * @param options - Loading options
 * @returns Promise that resolves to the file ID
 */
export async function loadFile(
  fileManager: FileManager,
  input: MidiInput,
  options: FileLoadOptions = {}
): Promise<string | null> {
  try {
    const parsedData = await parseMidi(input);
    const fileName = typeof input === "string" ? input : input.name;
    const displayName = options.displayName || fileName;

    const fileId = fileManager.midiManager.addMidiFile(
      fileName,
      parsedData,
      displayName
    );
    return fileId;
  } catch (error) {
    console.error(`Failed to load file:`, error);
    return null;
  }
}
/**
 * Load multiple MIDI files
 * @param files - Array of File objects to load
 * @param options - Loading options
 * @returns Promise that resolves to array of loaded file IDs
 */
export async function loadMultipleFiles(
  fileManager: FileManager,
  files: File[],
  options: FileLoadOptions = {}
): Promise<string[]> {
  const wasAlreadyBatching = fileManager.isBatchLoading;
  if (!wasAlreadyBatching && !options.suppressBatchLoading) {
    fileManager.isBatchLoading = true;
  }

  const loadedFileIds: string[] = [];

  for (const file of files) {
    try {
      const parsedData = await parseMidi(file);
      const displayName = options.displayName || file.name;
      const fileId = fileManager.midiManager.addMidiFile(
        file.name,
        parsedData,
        displayName
      );
      loadedFileIds.push(fileId);
    } catch (error) {
      console.error(`Failed to load ${file.name}:`, error);
    }
  }

  if (!wasAlreadyBatching && !options.suppressBatchLoading) {
    fileManager.isBatchLoading = false;
  }

  return loadedFileIds;
}
