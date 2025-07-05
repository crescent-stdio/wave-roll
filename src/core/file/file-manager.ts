/**
 * FileManager - Handles MIDI file loading, parsing, and management
 */

import { parseMidi } from "../parsers/midi-parser";
import { MidiInput, ParsedMidi } from "@/types";
import { MultiMidiManager, MidiFileEntry } from "../../MultiMidiManager";

/**
 * Interface for file loading options
 */
export interface FileLoadOptions {
  /** Optional display name for the file */
  displayName?: string;
  /** Whether to suppress batch loading optimizations */
  suppressBatchLoading?: boolean;
}

/**
 * Interface for sample file configuration
 */
export interface SampleFileConfig {
  /** Path to the MIDI file */
  path: string;
  /** Optional display name for the file */
  displayName?: string;
}

/**
 * Interface for file validation result
 */
export interface FileValidationResult {
  /** Whether the file is valid */
  isValid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Parsed MIDI data if validation succeeded */
  parsedData?: ParsedMidi;
}

/**
 * Default sample files configuration
 */
export const DEFAULT_SAMPLE_FILES: SampleFileConfig[] = [
  {
    path: "./src/sample_midi/basic_pitch_transcription.mid",
    displayName: "Basic Pitch Transcription",
  },
  {
    path: "./src/sample_midi/cut_liszt.mid",
    displayName: "Cut Liszt",
  },
];

/**
 * FileManager class handles all MIDI file operations
 */
export class FileManager {
  private midiManager: MultiMidiManager;
  private isBatchLoading: boolean = false;

  constructor(midiManager: MultiMidiManager) {
    this.midiManager = midiManager;
  }

  /**
   * Load sample MIDI files
   * @param files - Array of file configurations to load, defaults to DEFAULT_SAMPLE_FILES
   * @returns Promise that resolves when all files are loaded
   */
  async loadSampleFiles(files: SampleFileConfig[] = []): Promise<void> {
    this.isBatchLoading = true;

    const fileList = files.length > 0 ? files : DEFAULT_SAMPLE_FILES;

    for (const file of fileList) {
      try {
        const parsedData = await parseMidi(file.path);
        this.midiManager.addMidiFile(file.path, parsedData, file.displayName);
      } catch (error) {
        console.error(`Failed to load ${file.path}:`, error);
      }
    }

    this.isBatchLoading = false;
  }

  /**
   * Load a single MIDI file
   * @param input - File input (File object or URL string)
   * @param options - Loading options
   * @returns Promise that resolves to the file ID
   */
  async loadFile(
    input: MidiInput,
    options: FileLoadOptions = {}
  ): Promise<string | null> {
    try {
      const parsedData = await parseMidi(input);
      const fileName = typeof input === "string" ? input : input.name;
      const displayName = options.displayName || fileName;

      const fileId = this.midiManager.addMidiFile(
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
  async loadMultipleFiles(
    files: File[],
    options: FileLoadOptions = {}
  ): Promise<string[]> {
    const wasAlreadyBatching = this.isBatchLoading;
    if (!wasAlreadyBatching && !options.suppressBatchLoading) {
      this.isBatchLoading = true;
    }

    const loadedFileIds: string[] = [];

    for (const file of files) {
      try {
        const parsedData = await parseMidi(file);
        const displayName = options.displayName || file.name;
        const fileId = this.midiManager.addMidiFile(
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
      this.isBatchLoading = false;
    }

    return loadedFileIds;
  }

  /**
   * Validate a MIDI file before loading
   * @param input - File input to validate
   * @returns Promise that resolves to validation result
   */
  async validateFile(input: MidiInput): Promise<FileValidationResult> {
    try {
      const parsedData = await parseMidi(input);

      // Basic validation checks
      if (!parsedData.notes || parsedData.notes.length === 0) {
        return {
          isValid: false,
          error: "No notes found in MIDI file",
        };
      }

      if (parsedData.duration <= 0) {
        return {
          isValid: false,
          error: "Invalid MIDI file duration",
        };
      }

      return {
        isValid: true,
        parsedData,
      };
    } catch (error) {
      return {
        isValid: false,
        error:
          error instanceof Error ? error.message : "Unknown validation error",
      };
    }
  }

  /**
   * Remove a file from the manager
   * @param fileId - ID of the file to remove
   */
  removeFile(fileId: string): void {
    this.midiManager.removeMidiFile(fileId);
  }

  /**
   * Toggle file visibility
   * @param fileId - ID of the file to toggle
   */
  toggleFileVisibility(fileId: string): void {
    this.midiManager.toggleVisibility(fileId);
  }

  /**
   * Set file visibility
   * @param fileId - ID of the file
   * @param isVisible - Whether the file should be visible
   */
  setFileVisibility(fileId: string, isVisible: boolean): void {
    const file = this.midiManager
      .getState()
      .files.find((f: MidiFileEntry) => f.id === fileId);
    if (file && file.isVisible !== isVisible) {
      this.midiManager.toggleVisibility(fileId);
    }
  }

  /**
   * Update file display name
   * @param fileId - ID of the file
   * @param displayName - New display name
   */
  updateFileDisplayName(fileId: string, displayName: string): void {
    this.midiManager.updateDisplayName(fileId, displayName);
  }

  /**
   * Update file color
   * @param fileId - ID of the file
   * @param color - New color (PixiJS hex color)
   */
  updateFileColor(fileId: string, color: number): void {
    this.midiManager.updateColor(fileId, color);
  }

  /**
   * Get all files
   * @returns Array of file entries
   */
  getAllFiles(): MidiFileEntry[] {
    return this.midiManager.getState().files;
  }

  /**
   * Get a specific file by ID
   * @param fileId - ID of the file
   * @returns File entry or null if not found
   */
  getFile(fileId: string): MidiFileEntry | null {
    const files = this.getAllFiles();
    return files.find((file) => file.id === fileId) || null;
  }

  /**
   * Get visible files
   * @returns Array of visible file entries
   */
  getVisibleFiles(): MidiFileEntry[] {
    return this.getAllFiles().filter((file) => file.isVisible);
  }

  /**
   * Check if currently in batch loading mode
   * @returns Whether batch loading is active
   */
  isBatchLoadingActive(): boolean {
    return this.isBatchLoading;
  }

  /**
   * Set batch loading mode
   * @param isBatching - Whether to enable batch loading
   */
  setBatchLoading(isBatching: boolean): void {
    this.isBatchLoading = isBatching;
  }

  /**
   * Clear all files
   */
  clearAllFiles(): void {
    const files = this.getAllFiles();
    files.forEach((file) => this.removeFile(file.id));
  }

  /**
   * Get file count
   * @returns Number of loaded files
   */
  getFileCount(): number {
    return this.getAllFiles().length;
  }

  /**
   * Get visible file count
   * @returns Number of visible files
   */
  getVisibleFileCount(): number {
    return this.getVisibleFiles().length;
  }

  /**
   * Check if a file exists
   * @param fileId - ID of the file to check
   * @returns Whether the file exists
   */
  hasFile(fileId: string): boolean {
    return this.getFile(fileId) !== null;
  }

  /**
   * Create a file input element for file selection
   * @param options - Configuration options for the file input
   * @returns HTMLInputElement configured for MIDI file selection
   */
  createFileInput(
    options: {
      multiple?: boolean;
      accept?: string;
      onFileSelect?: (files: File[]) => void;
    } = {}
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
  async handleFileDrop(
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

    return this.loadMultipleFiles(files, options);
  }
}

/**
 * File management utility functions
 */
export const FileUtils = {
  /**
   * Check if a file is a valid MIDI file based on extension
   * @param file - File to check
   * @returns Whether the file has a valid MIDI extension
   */
  isValidMidiFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return name.endsWith(".mid") || name.endsWith(".midi");
  },

  /**
   * Get file size in human-readable format
   * @param bytes - File size in bytes
   * @returns Formatted file size string
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  },

  /**
   * Extract file name without extension
   * @param fileName - Full file name
   * @returns File name without extension
   */
  getFileNameWithoutExtension(fileName: string): string {
    return fileName.replace(/\.[^/.]+$/, "");
  },

  /**
   * Generate a unique file ID
   * @param fileName - Base file name
   * @returns Unique file ID
   */
  generateFileId(fileName: string): string {
    return `${fileName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  },
};
