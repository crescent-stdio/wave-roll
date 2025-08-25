import { parseMidi } from "@/lib/core/parsers/midi-parser";
import type { MidiInput } from "@/lib/midi/types";
import { DEFAULT_SAMPLE_FILES } from "./constants";
import { FileLoadOptions, SampleFileConfig, SampleAudioFileConfig } from "./types";
import { FileManager } from "./file-manager";
import { addAudioFileFromUrl } from "@/lib/core/waveform/register";

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
  const state = fileManager.stateManager?.getState();
  const pedalElongate = state?.visual.pedalElongate ?? false;
  const pedalThreshold = state?.visual.pedalThreshold ?? 64;

  for (const file of fileList) {
    try {
      const parsedData = await parseMidi(file.path, { 
        applyPedalElongate: pedalElongate,
        pedalThreshold: pedalThreshold 
      });
      fileManager.midiManager.addMidiFile(
        file.path,
        parsedData,
        file.displayName,
        file.path
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
    const state = fileManager.stateManager?.getState();
    const pedalElongate = state?.visual.pedalElongate ?? false;
    const pedalThreshold = state?.visual.pedalThreshold ?? 64;
    const parsedData = await parseMidi(input, { 
      applyPedalElongate: pedalElongate,
      pedalThreshold: pedalThreshold 
    });
    const fileName = typeof input === "string" ? input : input.name;
    const displayName = options.displayName || fileName;

    const fileId = fileManager.midiManager.addMidiFile(
      fileName,
      parsedData,
      displayName,
      input
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
  const state = fileManager.stateManager?.getState();
  const pedalElongate = state?.visual.pedalElongate ?? false;
  const pedalThreshold = state?.visual.pedalThreshold ?? 64;

  for (const file of files) {
    try {
      const parsedData = await parseMidi(file, { 
        applyPedalElongate: pedalElongate,
        pedalThreshold: pedalThreshold 
      });
      const displayName = options.displayName || file.name;
      const fileId = fileManager.midiManager.addMidiFile(
        file.name,
        parsedData,
        displayName,
        file
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

/**
 * Load a single audio file (URL string only for now)
 */
export async function loadAudioFile(
  fileManager: FileManager,
  input: string | File,
  options: FileLoadOptions & { color?: number } = {}
): Promise<string | null> {
  try {
    const url = typeof input === "string" ? input : URL.createObjectURL(input);
    const displayName = options.displayName || (typeof input === "string" ? input : input.name);

    // Register in AudioFiles store and kick off waveform decoding lazily
    const id = await addAudioFileFromUrl(fileManager, url, displayName, options.color);
    return id;
  } catch (error) {
    console.error(`Failed to load audio file:`, error);
    return null;
  }
}

/**
 * Load default sample audio files
 */
export async function loadSampleAudioFiles(
  fileManager: FileManager,
  files: SampleAudioFileConfig[] = []
): Promise<void> {
  fileManager.isBatchLoading = true;
  const list = files.length > 0 ? files : [];
  for (const f of list) {
    await loadAudioFile(fileManager, f.path, { displayName: f.displayName, color: f.color });
  }
  fileManager.isBatchLoading = false;
}
