/**
 * Detects when all audio sources are effectively silent (muted or volume = 0)
 * and triggers auto-pause functionality
 */

export interface SilenceDetectorOptions {
  onSilenceDetected?: () => void;
  onSoundDetected?: () => void;
  autoResumeOnUnmute?: boolean;
}

export class SilenceDetector {
  private fileVolumes: Map<string, number> = new Map();
  private wavVolumes: Map<string, number> = new Map();
  private fileMutes: Map<string, boolean> = new Map();
  private wavMutes: Map<string, boolean> = new Map();
  private masterVolume: number = 1.0;
  private wasPausedBySilence: boolean = false;
  private options: SilenceDetectorOptions;

  constructor(options: SilenceDetectorOptions = {}) {
    this.options = options;
  }

  /**
   * Set per-file volume (0-1)
   */
  public setFileVolume(fileId: string, volume: number): void {
    const wasAllSilent = this.isAllSilent();
    this.fileVolumes.set(fileId, volume);
    
    // Check if mute state should be updated based on volume
    if (volume === 0) {
      this.fileMutes.set(fileId, true);
    } else {
      this.fileMutes.set(fileId, false);
    }
    
    const isAllSilent = this.isAllSilent();
    this.handleSilenceChange(wasAllSilent, isAllSilent);
  }

  /**
   * Set WAV file volume (0-1)
   */
  public setWavVolume(fileId: string, volume: number): void {
    const wasAllSilent = this.isAllSilent();
    this.wavVolumes.set(fileId, volume);
    
    // Check if mute state should be updated based on volume
    if (volume === 0) {
      this.wavMutes.set(fileId, true);
    } else {
      this.wavMutes.set(fileId, false);
    }
    
    const isAllSilent = this.isAllSilent();
    this.handleSilenceChange(wasAllSilent, isAllSilent);
  }

  /**
   * Set file mute state
   */
  public setFileMute(fileId: string, muted: boolean): void {
    const wasAllSilent = this.isAllSilent();
    this.fileMutes.set(fileId, muted);
    const isAllSilent = this.isAllSilent();
    this.handleSilenceChange(wasAllSilent, isAllSilent);
  }

  /**
   * Set WAV mute state
   */
  public setWavMute(fileId: string, muted: boolean): void {
    const wasAllSilent = this.isAllSilent();
    this.wavMutes.set(fileId, muted);
    const isAllSilent = this.isAllSilent();
    this.handleSilenceChange(wasAllSilent, isAllSilent);
  }

  /**
   * Set master volume
   */
  public setMasterVolume(volume: number): void {
    const wasAllSilent = this.isAllSilent();
    this.masterVolume = volume;
    const isAllSilent = this.isAllSilent();
    this.handleSilenceChange(wasAllSilent, isAllSilent);
  }

  /**
   * Check current silence state and update if needed
   * This is called when volumes are changed via UI
   */
  public checkSilence(midiManager?: any): void {
    const wasAllSilent = this.isAllSilent();
    
    // Sync with MIDI manager if available
    if (midiManager) {
      const state = midiManager.getState();
      state.files.forEach((file: any) => {
        // Volume 0 means muted
        const volume = this.fileVolumes.get(file.id) ?? 1.0;
        const isMuted = volume === 0 || file.isMuted;
        this.fileMutes.set(file.id, isMuted);
        if (!this.fileVolumes.has(file.id)) {
          this.fileVolumes.set(file.id, isMuted ? 0 : 1.0);
        }
      });
    }

    // Check WAV files from global audio object
    const audioAPI = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ id: string; isMuted: boolean }> } })._waveRollAudio;
    if (audioAPI?.getFiles) {
      const wavFiles = audioAPI.getFiles() || [];
      wavFiles.forEach((wav) => {
        const volume = this.wavVolumes.get(wav.id) ?? 1.0;
        const isMuted = volume === 0 || wav.isMuted;
        this.wavMutes.set(wav.id, isMuted);
        if (!this.wavVolumes.has(wav.id)) {
          this.wavVolumes.set(wav.id, isMuted ? 0 : 1.0);
        }
      });
    }
    
    const isAllSilent = this.isAllSilent();
    this.handleSilenceChange(wasAllSilent, isAllSilent);
  }

  /**
   * Check if all audio sources are effectively silent
   */
  private isAllSilent(): boolean {
    // If master volume is 0, everything is silent
    if (this.masterVolume === 0) {
      return true;
    }

    // Check if there are any audio sources at all
    const hasAnySources = this.fileVolumes.size > 0 || this.wavVolumes.size > 0;
    if (!hasAnySources) {
      return false; // No sources means not silent (nothing to pause)
    }

    // Check MIDI files
    for (const [fileId, volume] of this.fileVolumes) {
      const isMuted = this.fileMutes.get(fileId) || false;
      const effectiveVolume = isMuted ? 0 : volume * this.masterVolume;
      if (effectiveVolume > 0) {
        return false; // Found an audible source
      }
    }

    // Check WAV files  
    for (const [fileId, volume] of this.wavVolumes) {
      const isMuted = this.wavMutes.get(fileId) || false;
      const effectiveVolume = isMuted ? 0 : volume * this.masterVolume;
      if (effectiveVolume > 0) {
        return false; // Found an audible source
      }
    }

    // All sources are silent
    return true;
  }

  /**
   * Handle silence state changes
   */
  private handleSilenceChange(wasAllSilent: boolean, isAllSilent: boolean): void {
    if (!wasAllSilent && isAllSilent) {
      // Just became silent
      this.wasPausedBySilence = true;
      if (this.options.onSilenceDetected) {
        this.options.onSilenceDetected();
      }
    } else if (wasAllSilent && !isAllSilent) {
      // Just became audible
      if (this.wasPausedBySilence && this.options.autoResumeOnUnmute) {
        // Could auto-resume here if desired
        this.wasPausedBySilence = false;
      }
      if (this.options.onSoundDetected) {
        this.options.onSoundDetected();
      }
    }
  }

  /**
   * Reset the silence detector state
   */
  public reset(): void {
    this.fileVolumes.clear();
    this.wavVolumes.clear();
    this.fileMutes.clear();
    this.wavMutes.clear();
    this.masterVolume = 1.0;
    this.wasPausedBySilence = false;
  }
}
