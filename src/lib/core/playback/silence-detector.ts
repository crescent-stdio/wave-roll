/**
 * Detects when all audio sources are effectively silent (muted or volume = 0)
 * and triggers auto-pause functionality
 */

import { VolumeStateManager } from './utils';
import * as Tone from 'tone';

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
  private midiManager: any | null = null;
  private pendingPauseTimer: number | null = null;
  private static readonly PAUSE_DEBOUNCE_MS = 400;

  constructor(options: SilenceDetectorOptions = {}) {
    this.options = options;
    
    // Initialize volume managers without automatic handlers
    // We'll manually check for silence changes to have better control
    this.fileVolumeManager = new VolumeStateManager();
    this.wavVolumeManager = new VolumeStateManager();
  }

  /**
   * Attach MIDI manager so WAV mute/volume updates can consider current MIDI state.
   * This prevents false "all silent" detections when only WAV is muted.
   */
  public attachMidiManager(midiManager: any): void {
    this.midiManager = midiManager;
    // Initial sync
    this.syncFromMidiManagerIfAvailable();
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
    // Ensure MIDI state is reflected before evaluating silence
    this.syncFromMidiManagerIfAvailable();
    const wasAllSilent = this.isAllSilent();
    this.wavVolumeManager.setVolume(fileId, volume);
    // Re-sync after change as well (in case UI didn't touch MIDI state)
    this.syncFromMidiManagerIfAvailable();
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
    // Ensure MIDI state is reflected before evaluating silence
    this.syncFromMidiManagerIfAvailable();
    const wasAllSilent = this.isAllSilent();
    this.wavVolumeManager.setMuted(fileId, muted);
    // Re-sync after change as well
    this.syncFromMidiManagerIfAvailable();
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
      this.syncFromMidiManager(midiManager);
    } else {
      this.syncFromMidiManagerIfAvailable();
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
   * Sync MIDI file mute/volume status into the internal file manager.
   */
  private syncFromMidiManager(midiManager: any): void {
    try {
      const state = midiManager?.getState?.();
      const files = state?.files || [];
      files.forEach((file: any) => {
        const currentVol = this.fileVolumeManager.getVolume(file.id);
        const isMuted = currentVol === 0 || file.isMuted === true;
        this.fileVolumeManager.setMuted(file.id, isMuted);
        if (currentVol === undefined) {
          this.fileVolumeManager.setVolume(file.id, isMuted ? 0 : 1.0);
        }
      });
    } catch {}
  }

  private syncFromMidiManagerIfAvailable(): void {
    if (this.midiManager) {
      this.syncFromMidiManager(this.midiManager);
    }
  }

  /**
   * Check if all audio sources are effectively silent
   */
  private isAllSilent(): boolean {
    // If MIDI has any unmuted file, we are not silent regardless of WAV state
    try {
      if (this.midiManager?.getState) {
        const m = this.midiManager.getState();
        if (Array.isArray(m?.files) && m.files.some((f: any) => f && f.isMuted === false)) {
          return false;
        }
      }
    } catch {}

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
    // Broadcast event for UI components that want to reflect all-silent state (e.g. master mute icon)
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wr-silence-changed', { detail: { isAllSilent } }));
      }
    } catch {}
    if (!wasAllSilent && isAllSilent) {
      // Debounce pause to avoid pausing during quick mute/unmute sequences
      if (this.pendingPauseTimer !== null) {
        clearTimeout(this.pendingPauseTimer);
        this.pendingPauseTimer = null;
      }
      // Double-check with external sources to avoid false positives when
      // internal managers have not yet been populated.
      if (this.hasAnyExternalAudible()) {
        return; // audible sources exist → do not pause
      }
      this.pendingPauseTimer = (setTimeout as unknown as (h: any, t: number) => number)(() => {
        this.pendingPauseTimer = null;
        // Re-validate before pausing
        if (!this.isAllSilent()) {
          return;
        }
        // Do not auto-pause while transport is running (user-intended mute of all sources)
        try {
          if (Tone.getTransport().state === 'started') {
            return;
          }
        } catch {}
        this.wasPausedBySilence = true;
        if (this.options.onSilenceDetected) {
          this.options.onSilenceDetected();
        }
      }, SilenceDetector.PAUSE_DEBOUNCE_MS) as unknown as number;
    } else if (wasAllSilent && !isAllSilent) {
      // Cancel pending pause if any
      if (this.pendingPauseTimer !== null) {
        clearTimeout(this.pendingPauseTimer);
        this.pendingPauseTimer = null;
      }
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

  /** Public accessor for effective silence state (for initial UI sync) */
  public isEffectivelySilent(): boolean {
    return this.isAllSilent();
  }

  /**
   * External sanity check: detect any audible sources directly from providers.
   * Returns true if at least one source (MIDI or WAV) is currently unmuted/visible.
   */
  private hasAnyExternalAudible(): boolean {
    try {
      // Check MIDI manager
      if (this.midiManager?.getState) {
        const m = this.midiManager.getState();
        if (Array.isArray(m?.files)) {
          const anyAudibleMidi = m.files.some((f: any) => f && f.isMuted === false);
          if (anyAudibleMidi) return true;
        }
      }

      // Check WAV registry
      const audioAPI = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ id: string; isMuted: boolean; isVisible: boolean }> } })._waveRollAudio;
      if (audioAPI?.getFiles) {
        const wavFiles = audioAPI.getFiles() || [];
        const anyAudibleWav = wavFiles.some((w) => w && w.isVisible && w.isMuted === false);
        if (anyAudibleWav) return true;
      }
    } catch {}
    return false;
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
