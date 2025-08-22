import { StateManager } from "@/core/state";
import { FileManager } from "@/core/file";
import { DEFAULT_SAMPLE_FILES, DEFAULT_SAMPLE_AUDIO_FILES } from "@/core/file/constants";

export class FileLoader {
  constructor(
    private stateManager: StateManager,
    private fileManager: FileManager
  ) {}

  /**
   * Load sample MIDI files
   */
  async loadSampleFiles(
    files: Array<{
      path: string;
      displayName?: string;
      type?: "midi" | "audio";
    }> = [],
    callbacks?: {
      onComplete?: () => void;
      onError?: (error: any) => void;
    }
  ): Promise<void> {
    this.stateManager.updateUIState({ isBatchLoading: true });

    const fileList = files.length > 0 ? files : DEFAULT_SAMPLE_FILES;

    // Separate files by type
    const midiFiles = fileList.filter((f) => !f.type || f.type === "midi");
    const audioFiles = fileList.filter((f) => f.type === "audio");

    try {
      // Load MIDI files
      if (midiFiles.length > 0) {
        await this.fileManager.loadSampleFiles(midiFiles);
      }

      // Load audio files
      if (audioFiles.length > 0) {
        await this.fileManager.loadSampleAudioFiles(audioFiles);
      }

      callbacks?.onComplete?.();
    } catch (error) {
      console.error("Error loading sample files:", error);
      callbacks?.onError?.(error);
    } finally {
      this.stateManager.updateUIState({ isBatchLoading: false });
    }
  }
}