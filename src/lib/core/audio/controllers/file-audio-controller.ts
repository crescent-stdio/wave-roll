/**
 * File Audio Controller
 * Handles per-file audio settings: mute, volume, pan for multi-file playback
 */

import { clamp } from "../../utils";
import { SamplerManager } from "../managers/sampler-manager";
import { WavPlayerManager } from "../managers/wav-player-manager";

export interface FileAudioControllerDeps {
  samplerManager: SamplerManager;
  wavPlayerManager: WavPlayerManager;
  midiManager?: any;
  onFileSettingsChange?: () => void;
}

export class FileAudioController {
  private deps: FileAudioControllerDeps;

  constructor(deps: FileAudioControllerDeps) {
    this.deps = deps;
  }

  /**
   * Set per-file pan
   */
  setFilePan(fileId: string, pan: number): void {
    const clamped = clamp(pan, -1, 1);
    // console.log("[FileAudioController.setFilePan]", { fileId, pan: clamped });
    
    this.deps.samplerManager.setFilePan(fileId, clamped);
  }

  /**
   * Set per-file mute
   */
  setFileMute(fileId: string, mute: boolean): void {
    const { samplerManager, wavPlayerManager, midiManager, onFileSettingsChange } = this.deps;
    
    // console.log("[FileAudioController.setFileMute]", { fileId, mute });

    // Try sampler first
    samplerManager.setFileMute(fileId, mute);
    
    // Also try external WAV player
    const wavResult = wavPlayerManager.setFileMute(fileId, mute);
    
    if (!wavResult) {
      // WAV player might not have this file, which is okay
    }

    // Update midiManager state if available
    if (midiManager?.setFileMute) {
      midiManager.setFileMute(fileId, mute);
    }

    // Notify of change
    if (onFileSettingsChange) {
      onFileSettingsChange();
    }
  }

  /**
   * Set per-file MIDI volume
   */
  setFileVolume(fileId: string, volume: number): void {
    const clamped = clamp(volume, 0, 1);
    // console.log("[FileAudioController.setFileVolume]", { fileId, volume: clamped });
    
    // setFileVolume requires masterVolume parameter
    const masterVolume = 1.0; // Default master volume
    this.deps.samplerManager.setFileVolume(fileId, clamped, masterVolume);
  }

  /**
   * Set per-file WAV volume
   */
  setWavVolume(fileId: string, volume: number, masterVolume: number, state: { isPlaying: boolean; currentTime: number }): void {
    const { wavPlayerManager, midiManager } = this.deps;
    
    const clamped = clamp(volume, 0, 1);
    // console.log("[FileAudioController.setWavVolume]", { fileId, volume: clamped });
    
    // Use the wav-specific method
    wavPlayerManager.setWavVolume(fileId, clamped, masterVolume, state);

    // Update midiManager state if available
    if (midiManager?.setWavVolume) {
      midiManager.setWavVolume(fileId, clamped);
    }
  }

  /**
   * Get file mute states
   */
  getFileMuteStates(): Map<string, boolean> {
    const states = new Map<string, boolean>();
    
    // Get from sampler
    const samplerStates = this.deps.samplerManager.getFileMuteStates();
    for (const [fileId, muted] of samplerStates) {
      states.set(fileId, muted);
    }
    
    // Get from WAV player
    const wavStates = this.deps.wavPlayerManager.getFileMuteStates();
    for (const [fileId, muted] of wavStates) {
      states.set(fileId, muted);
    }
    
    return states;
  }

  /**
   * Get file volume states
   */
  getFileVolumeStates(): Map<string, number> {
    const states = new Map<string, number>();
    
    // Get from sampler
    const samplerVolumes = this.deps.samplerManager.getFileVolumeStates();
    for (const [fileId, volume] of samplerVolumes) {
      states.set(fileId, volume);
    }
    
    // Get from WAV player
    const wavVolumes = this.deps.wavPlayerManager.getFileVolumeStates();
    for (const [fileId, volume] of wavVolumes) {
      states.set(fileId, volume);
    }
    
    return states;
  }

  /**
   * Check if all files are muted
   */
  areAllFilesMuted(): boolean {
    const samplerMuted = this.deps.samplerManager.areAllTracksMuted();
    const wavMuted = this.deps.wavPlayerManager.areAllPlayersMuted();
    
    return samplerMuted && wavMuted;
  }

  /**
   * Check if all files have zero volume
   */
  areAllFilesZeroVolume(): boolean {
    const samplerZero = this.deps.samplerManager.areAllTracksZeroVolume();
    const wavZero = this.deps.wavPlayerManager.areAllPlayersZeroVolume();
    
    return samplerZero && wavZero;
  }

  /**
   * Refresh external audio players
   */
  refreshAudioPlayers(): void {
    const { wavPlayerManager, midiManager } = this.deps;
    
    // console.log("[FileAudioController.refreshAudioPlayers] Refreshing external audio players");
    
    const refreshed = wavPlayerManager.refreshFromMidiManager(midiManager);
    
    if (refreshed) {
      // console.log("[FileAudioController.refreshAudioPlayers] Audio players refreshed");
    }
  }
}
