/**
 * Detects when all audio sources are effectively silent
 * and triggers auto-pause functionality
 */

import { MultiMidiManager } from "@/core/midi/multi-midi-manager";

export interface SilenceDetectorOptions {
  autoResumeOnUnmute?: boolean;
  onSilenceDetected?: () => void;
  onSoundDetected?: () => void;
}

export class SilenceDetector {
  private options: SilenceDetectorOptions;
  private masterVolume: number = 1.0;
  private fileVolumes: Map<string, number> = new Map();
  private wasPlayingBeforeSilence: boolean = false;
  
  constructor(options: SilenceDetectorOptions = {}) {
    this.options = {
      autoResumeOnUnmute: false,
      ...options
    };
  }
  
  /**
   * Update master volume
   */
  public setMasterVolume(volume: number): void {
    const wasSilent = this.isAllSilent();
    this.masterVolume = volume;
    const isSilent = this.isAllSilent();
    
    this.checkSilenceStateChange(wasSilent, isSilent);
  }
  
  /**
   * Update per-file volume
   */
  public setFileVolume(fileId: string, volume: number): void {
    const wasSilent = this.isAllSilent();
    this.fileVolumes.set(fileId, volume);
    const isSilent = this.isAllSilent();
    
    this.checkSilenceStateChange(wasSilent, isSilent);
  }
  
  /**
   * Check if all sources are effectively silent based on MIDI manager state
   */
  public checkSilence(midiManager: MultiMidiManager): boolean {
    const wasSilent = this.isAllSilent();
    
    // Check MIDI files
    const midiState = midiManager.getState();
    let hasAudibleMidi = false;
    
    midiState.files.forEach(file => {
      if (!file.isMuted) {
        const fileVolume = this.fileVolumes.get(file.id) ?? 1.0;
        if (fileVolume > 0 && this.masterVolume > 0) {
          hasAudibleMidi = true;
        }
      }
    });
    
    // Check WAV files
    let hasAudibleWav = false;
    try {
      const audioAPI = (window as any)._waveRollAudio;
      if (audioAPI?.getFiles) {
        const wavFiles = audioAPI.getFiles();
        wavFiles.forEach((file: any) => {
          if (file.isVisible && !file.isMuted) {
            const fileVolume = this.fileVolumes.get(file.id) ?? 1.0;
            if (fileVolume > 0 && this.masterVolume > 0) {
              hasAudibleWav = true;
            }
          }
        });
      }
    } catch {
      // Audio API not available
    }
    
    const isSilent = !hasAudibleMidi && !hasAudibleWav;
    this.checkSilenceStateChange(wasSilent, isSilent);
    
    return isSilent;
  }
  
  /**
   * Check if all sources are silent
   */
  private isAllSilent(): boolean {
    // Master volume check
    if (this.masterVolume === 0) return true;
    
    // Check if any file has non-zero volume
    let hasAudibleSource = false;
    
    // Check registered file volumes
    this.fileVolumes.forEach(volume => {
      if (volume > 0) {
        hasAudibleSource = true;
      }
    });
    
    // If no files registered yet, consider it not silent
    if (this.fileVolumes.size === 0) {
      return false;
    }
    
    return !hasAudibleSource;
  }
  
  /**
   * Handle silence state changes
   */
  private checkSilenceStateChange(wasSilent: boolean, isSilent: boolean): void {
    if (!wasSilent && isSilent) {
      // Just became silent
      if (this.options.onSilenceDetected) {
        this.options.onSilenceDetected();
      }
    } else if (wasSilent && !isSilent) {
      // Just became audible
      if (this.options.onSoundDetected && this.options.autoResumeOnUnmute) {
        this.options.onSoundDetected();
      }
    }
  }
  
  /**
   * Set playback state for auto-resume tracking
   */
  public setPlayingState(isPlaying: boolean): void {
    if (!this.isAllSilent()) {
      this.wasPlayingBeforeSilence = isPlaying;
    }
  }
  
  /**
   * Check if should auto-resume
   */
  public shouldAutoResume(): boolean {
    return this.options.autoResumeOnUnmute === true && this.wasPlayingBeforeSilence;
  }
}