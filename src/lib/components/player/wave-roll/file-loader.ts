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
    console.log('[FileLoader] Loading files:', fileList.map(f => `${f.displayName} (${f.type || 'midi'})`));

    // Separate files by type
    const midiFiles = fileList.filter((f) => !f.type || f.type === "midi");
    const audioFiles = fileList.filter((f) => f.type === "audio");

    console.log('[FileLoader] MIDI files:', midiFiles.length, 'Audio files:', audioFiles.length);

    try {
      // Load MIDI files
      if (midiFiles.length > 0) {
        console.log('[FileLoader] Loading MIDI files...');
        await this.fileManager.loadSampleFiles(midiFiles);
        console.log('[FileLoader] MIDI files loaded successfully');
        
        // Debug: Check MIDI data after loading
        const midiState = this.fileManager.midiManager.getState();
        console.log('[FileLoader] MIDI Manager state after loading:', {
          filesCount: midiState.files.length,
          totalNotes: midiState.files.reduce((total, file) => total + (file.parsedData?.notes?.length || 0), 0),
          files: midiState.files.map(f => ({
            displayName: f.displayName,
            notesCount: f.parsedData?.notes?.length || 0,
            isVisible: f.isVisible,
            isMuted: f.isMuted
          }))
        });
      }

      // Load audio files
      if (audioFiles.length > 0) {
        console.log('[FileLoader] Loading audio files...');
        await this.fileManager.loadSampleAudioFiles(audioFiles);
        console.log('[FileLoader] Audio files loaded successfully');
        
        // Check registry after loading
        const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => any[] } })._waveRollAudio;
        if (api?.getFiles) {
          const registeredFiles = api.getFiles();
          console.log('[FileLoader] WAV registry after loading:', registeredFiles.length, 'files:', registeredFiles.map(f => f.displayName || f.id));
        } else {
          console.log('[FileLoader] WAV registry still not available after loading');
        }
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