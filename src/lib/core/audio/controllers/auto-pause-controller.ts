/**
 * Auto-Pause Controller
 * Handles automatic pausing when all audio sources are muted or at zero volume
 */

import { AudioPlayerState } from "../player-types";

export interface AutoPauseControllerDeps {
  state: AudioPlayerState;
  onAutoPause?: () => void;
  onAutoResume?: () => void;
  checkAllMuted: () => boolean;
  checkAllZeroVolume: () => boolean;
}

export class AutoPauseController {
  private deps: AutoPauseControllerDeps;
  
  /** Whether we paused automatically because all sources became silent */
  private _autoPausedBySilence = false;
  
  /** Until when we should ignore auto-pause checks after an auto-resume (ms timestamp) */
  private _silencePauseGuardUntilMs = 0;

  constructor(deps: AutoPauseControllerDeps) {
    this.deps = deps;
  }

  /**
   * Check if we should auto-pause due to all sources being silent
   * Returns true if auto-pause was triggered
   */
  maybeAutoPause(): boolean {
    const { state, checkAllMuted, checkAllZeroVolume, onAutoPause } = this.deps;
    
    // Don't auto-pause if not playing
    if (!state.isPlaying) {
      return false;
    }

    // Check if we're within the guard period after auto-resume
    if (Date.now() < this._silencePauseGuardUntilMs) {
      return false;
    }

    // Check if everything is silent
    const globalVolumeZero = state.volume === 0;
    const allFilesMuted = checkAllMuted();
    const allFilesZeroVolume = checkAllZeroVolume();
    
    const shouldAutoPause = globalVolumeZero || allFilesMuted || allFilesZeroVolume;

    if (shouldAutoPause && !this._autoPausedBySilence) {
      // console.log("[AutoPauseController] Auto-pausing due to silence", {
      //   globalVolumeZero,
      //   allFilesMuted,
      //   allFilesZeroVolume,
      // });
      
      this._autoPausedBySilence = true;
      
      if (onAutoPause) {
        onAutoPause();
      }
      
      return true;
    }

    return false;
  }

  /**
   * Check if we should auto-resume after being auto-paused
   * Returns true if auto-resume should occur
   */
  maybeAutoResume(): boolean {
    const { state, checkAllMuted, checkAllZeroVolume, onAutoResume } = this.deps;
    
    // Only auto-resume if we were auto-paused
    if (!this._autoPausedBySilence) {
      return false;
    }

    // Check if any source is now audible
    const globalVolumeAudible = state.volume > 0;
    const someFilesUnmuted = !checkAllMuted();
    const someFilesAudible = !checkAllZeroVolume();
    
    const shouldAutoResume = globalVolumeAudible && (someFilesUnmuted || someFilesAudible);

    if (shouldAutoResume) {
      // console.log("[AutoPauseController] Auto-resuming from silence", {
      //   globalVolumeAudible,
      //   someFilesUnmuted,
      //   someFilesAudible,
      // });
      
      this._autoPausedBySilence = false;
      
      // Set guard period to prevent immediate re-pause (500ms)
      this._silencePauseGuardUntilMs = Date.now() + 500;
      
      if (onAutoResume) {
        onAutoResume();
      }
      
      return true;
    }

    return false;
  }

  /**
   * Reset auto-pause state
   */
  reset(): void {
    this._autoPausedBySilence = false;
    this._silencePauseGuardUntilMs = 0;
  }

  /**
   * Get current auto-pause state
   */
  isAutoPaused(): boolean {
    return this._autoPausedBySilence;
  }

  /**
   * Manually set auto-pause state (for external control)
   */
  setAutoPaused(paused: boolean): void {
    this._autoPausedBySilence = paused;
    if (!paused) {
      this._silencePauseGuardUntilMs = Date.now() + 500;
    }
  }
}
