import * as Loader from "./loader";
import { MultiMidiManager } from "@/lib/core/midi/multi-midi-manager";
import { SampleFileConfig } from "./types";
import { MidiInput } from "@/lib/midi/types";
import { FileLoadOptions } from "./types";
import { MidiFileEntry } from "@/lib/midi/types";
import { StateManager } from "@/core/state";

export class FileManager {
  public midiManager: MultiMidiManager;
  public isBatchLoading = false;
  /** Lazy audio files registry lives under `window._waveRollAudio` to keep surface minimal */
  public stateManager?: StateManager;

  constructor(midiManager: MultiMidiManager, stateManager?: StateManager) {
    this.midiManager = midiManager;
    this.stateManager = stateManager;
  }

  /** Load default or custom sample files. */
  async loadSampleFiles(files: SampleFileConfig[] = []): Promise<void> {
    return Loader.loadSampleFiles(this, files);
  }

  /** Load a single MIDI file (local File object or URL). */
  async loadFile(
    input: MidiInput,
    options: FileLoadOptions = {}
  ): Promise<string | null> {
    return Loader.loadFile(this, input, options);
  }

  /** Load multiple local files at once. */
  async loadMultipleFiles(
    files: File[],
    options: FileLoadOptions = {}
  ): Promise<string[]> {
    return Loader.loadMultipleFiles(this, files, options);
  }

  /** Load a single audio file (wav/mp3) */
  async loadAudioFile(
    input: string | File,
    options: FileLoadOptions & { color?: number } = {}
  ): Promise<string | null> {
    return Loader.loadAudioFile(this, input, options);
  }

  /** Load sample audio files */
  async loadSampleAudioFiles(
    files: Array<{ path: string; displayName?: string; color?: number; type?: "midi" | "audio" }> = []
  ): Promise<void> {
    return Loader.loadSampleAudioFiles(this, files);
  }

  /* ==READ-ONLY== */
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
    return this.getAllFiles().filter((file) => file.isPianoRollVisible);
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

  /* ==MUTATE== */
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
    if (file && file.isPianoRollVisible !== isVisible) {
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
   * Check if a file exists
   * @param fileId - ID of the file to check
   * @returns Whether the file exists
   */
  hasFile(fileId: string): boolean {
    return this.getFile(fileId) !== null;
  }
}
