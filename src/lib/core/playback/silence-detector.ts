/**
 * Detects when all audio sources are effectively silent (muted or volume = 0)
 * and triggers auto-pause functionality
 */

import { VolumeStateManager } from './utils';

export interface SilenceDetectorOptions {
  onSilenceDetected?: () => void;
  onSoundDetected?: () => void;
  autoResumeOnUnmute?: boolean;
}

type SourceType = 'file' | 'wav';

export class SilenceDetector {
  private fileVolumeManager: VolumeStateManager<string>;
  private wavVolumeManager: VolumeStateManager<string>;
  private masterVolume: number = 1.0;
  private wasPausedBySilence: boolean = false;
  private options: SilenceDetectorOptions;

  constructor(options: SilenceDetectorOptions = {}) {
    this.options = options;
    
    // Initialize volume managers without automatic handlers
    // We'll manually check for silence changes to have better control
    this.fileVolumeManager = new VolumeStateManager();
    this.wavVolumeManager = new VolumeStateManager();
  }

  /**
   * Set per-file volume (0-1)
   */
  public setFileVolume(fileId: string, volume: number): void {
    const wasAllSilent = this.isAllSilent();
    this.fileVolumeManager.setVolume(fileId, volume);
    const isAllSilent = this.isAllSilent();
    this.handleSilenceChange(wasAllSilent, isAllSilent);
  }

  /**
   * Set WAV file volume (0-1)
   */
  public setWavVolume(fileId: string, volume: number): void {
    const wasAllSilent = this.isAllSilent();
    this.wavVolumeManager.setVolume(fileId, volume);
    const isAllSilent = this.isAllSilent();
    this.handleSilenceChange(wasAllSilent, isAllSilent);
  }

  /**
   * Set file mute state
   */
  public setFileMute(fileId: string, muted: boolean): void {
    const wasAllSilent = this.isAllSilent();
    this.fileVolumeManager.setMuted(fileId, muted);
    const isAllSilent = this.isAllSilent();
    this.handleSilenceChange(wasAllSilent, isAllSilent);
  }

  /**
   * Set WAV mute state
   */
  public setWavMute(fileId: string, muted: boolean): void {
    const wasAllSilent = this.isAllSilent();
    this.wavVolumeManager.setMuted(fileId, muted);
    const isAllSilent = this.isAllSilent();
    this.handleSilenceChange(wasAllSilent, isAllSilent);
  }

  /**
   * Set master volume
   */
  public setMasterVolume(volume: number): void {
    const wasAllSilent = this.isAllSilent();
    this.masterVolume = volume;
    this.fileVolumeManager.setMasterVolume(volume);
    this.wavVolumeManager.setMasterVolume(volume);
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
        // Initialize from current manager state if missing
        const currentVol = this.fileVolumeManager.getVolume(file.id);
        // Consider both our tracked volume and MIDI manager mute flag
        const isMuted = currentVol === 0 || file.isMuted === true;
        this.fileVolumeManager.setMuted(file.id, isMuted);
        // Ensure a volume entry exists so source is tracked
        if (currentVol === undefined) {
          this.fileVolumeManager.setVolume(file.id, isMuted ? 0 : 1.0);
        }
      });
    }

    // Check WAV files from global audio object
    const audioAPI = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ id: string; isMuted: boolean }> } })._waveRollAudio;
    if (audioAPI?.getFiles) {
      const wavFiles = audioAPI.getFiles() || [];
      wavFiles.forEach((wav) => {
        const currentVol = this.wavVolumeManager.getVolume(wav.id);
        const isMuted = currentVol === 0 || wav.isMuted === true;
        this.wavVolumeManager.setMuted(wav.id, isMuted);
        if (currentVol === undefined) {
          this.wavVolumeManager.setVolume(wav.id, isMuted ? 0 : 1.0);
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
    // Check if there are any audio sources at all
    const fileState = this.fileVolumeManager.getState();
    const wavState = this.wavVolumeManager.getState();
    const hasAnySources = fileState.sources.size > 0 || wavState.sources.size > 0;
    
    if (!hasAnySources) {
      return false; // No sources means not silent (nothing to pause)
    }

    // Both managers must report all their sources as silent
    const filesAreSilent = this.fileVolumeManager.isAllSilent();
    const wavsAreSilent = this.wavVolumeManager.isAllSilent();
    
    // But if one has no sources, that's OK - only check the one with sources
    const fileHasSources = fileState.sources.size > 0;
    const wavHasSources = wavState.sources.size > 0;
    
    if (fileHasSources && wavHasSources) {
      return filesAreSilent && wavsAreSilent;
    } else if (fileHasSources) {
      return filesAreSilent;
    } else if (wavHasSources) {
      return wavsAreSilent;
    }
    
    return false;
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
      if (this.options.onSoundDetected) {
        this.options.onSoundDetected();
      }
      if (this.wasPausedBySilence && this.options.autoResumeOnUnmute) {
        // Could auto-resume here if desired
        this.wasPausedBySilence = false;
      }
    }
  }

  /**
   * Reset the silence detector state
   */
  public reset(): void {
    this.fileVolumeManager.clear();
    this.wavVolumeManager.clear();
    this.masterVolume = 1.0;
    this.wasPausedBySilence = false;
  }
}
