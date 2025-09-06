/**
 * Transport Sync Manager
 * Handles synchronization between Tone.js Transport and piano roll visualization
 */

import * as Tone from "tone";
import { PianoRollSync, AudioPlayerState, AUDIO_CONSTANTS, OperationState } from "../player-types";

export interface TransportSyncOptions {
  syncInterval: number;
  originalTempo: number;
}

export class TransportSyncManager {
  private static DEBUG = false;
  // Performance monitoring
  private performanceMetrics = {
    updateCount: 0,
    totalUpdateTime: 0,
    slowUpdates: 0,
    lastUpdateTime: 0,
  };
  private pianoRoll: PianoRollSync;
  private syncRafId: number | null = null;
  private syncScheduler: number | null = null;
  private _schedulerToken = 0;
  private _lastSeekTimestamp = 0;
  private options: TransportSyncOptions;
  private state: AudioPlayerState;
  private operationState: OperationState;
  private onEndCallback?: () => void;

  constructor(
    pianoRoll: PianoRollSync,
    state: AudioPlayerState,
    operationState: OperationState,
    originalTempo: number
  ) {
    this.pianoRoll = pianoRoll;
    this.state = state;
    this.operationState = operationState;
    this.options = {
      syncInterval: AUDIO_CONSTANTS.DEFAULT_SYNC_INTERVAL,
      originalTempo
    };
  }

  /**
   * Effective duration considering both MIDI notes and visible WAV buffers.
   * Falls back to state.duration when registry/audio buffers are unavailable.
   */
  private getEffectiveDuration(): number {
    let duration = this.state.duration || 0;
    try {
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ isVisible?: boolean; isMuted?: boolean; volume?: number; audioBuffer?: { duration?: number } }> } })._waveRollAudio;
      const items = api?.getFiles?.();
      if (items && Array.isArray(items)) {
        const audioDurations = items
          // Only consider WAV sources that are actually audible: visible, unmuted, volume > 0 (if provided)
          .filter((i) => i && (i.isVisible !== false) && (i.isMuted !== true) && (i.volume === undefined || i.volume > 0))
          .map((i) => (i?.audioBuffer?.duration ?? 0))
          .filter((d) => typeof d === 'number' && d > 0);
        if (audioDurations.length > 0) {
          duration = Math.max(duration, ...audioDurations);
        }
      }
    } catch {
      // ignore if registry is not present
    }
    return duration;
  }

  /**
   * Update seek timestamp for guard in event handlers
   */
  updateSeekTimestamp(): void {
    this._lastSeekTimestamp = Date.now();
  }

  /**
   * Check if we should suppress transport stop event
   */
  shouldSuppressStop(): boolean {
    const SEEK_SUPPRESS_MS = AUDIO_CONSTANTS.SEEK_SUPPRESS_MS;
    return Date.now() - this._lastSeekTimestamp < SEEK_SUPPRESS_MS;
  }

  /**
   * Schedule a visual update at the next safe opportunity
   */
  scheduleVisualUpdate(callback: () => void): void {
    // Use requestAnimationFrame for smooth visual updates
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(callback);
    } else {
      // Fallback to immediate execution in non-browser environments
      callback();
    }
  }

  /**
   * Start playhead synchronization scheduler
   */
  startSyncScheduler(): void {
    this.stopSyncScheduler();

    // Store new token for this scheduler instance
    const token = ++this._schedulerToken;

    // Skip initial sync if we're seeking - the seek already set the position
    if (!this.operationState.isSeeking) {
      // Force initial sync to current position
      const transport = Tone.getTransport();
      const transportTime = transport.seconds;
      // Visual time calculation using state.tempo which now reflects playback rate
      const visualTime =
        (transportTime * this.state.tempo) / this.options.originalTempo;

      // Prevent the playhead from jumping backwards when a new sync-scheduler starts
      const TOLERANCE_SEC = 1;
      if (visualTime >= this.state.currentTime - TOLERANCE_SEC) {
        // Update state and visual only if not stale
        this.state.currentTime = visualTime;
        this.state.nowTime = visualTime; // Update unified time reference
        this.pianoRoll.setTime(visualTime);
      }
    }

    const performUpdate = () => {
      // Performance monitoring start
      const updateStart = performance.now();
      
      // Ignore callbacks from an outdated scheduler
      if (token !== this._schedulerToken) {
        return;
      }
      if (!this.state.isPlaying) {
        return;
      }
      
      // Allow UI updates to continue during seeking operations for immediate feedback
      // Only skip transport time calculations during the initial seeking phase
      if (this.operationState.isSeeking && this.operationState.isRestarting) {
        // Still update UI with current state during restart operations
        this.pianoRoll.setTime(this.state.currentTime);
        return;
      }

      const transport = Tone.getTransport();
      // Skip update if transport is not actually running yet
      if (transport.state !== "started") {
        return;
      }

      const transportTime = transport.seconds;

      // Visual time calculation using state.tempo which now reflects playback rate
      let visualTime =
        (transportTime * this.state.tempo) / this.options.originalTempo;
      const effectiveDuration = this.getEffectiveDuration();
      
      // Auto-pause when playback ends and repeat is off
      if (!this.state.isRepeating && visualTime >= effectiveDuration) {
        // Clamp to duration before updating
        visualTime = effectiveDuration;
        
        // Update state and visual one last time at exact duration
        this.state.currentTime = visualTime;
        this.state.nowTime = visualTime; // Update unified time reference
        this.pianoRoll.setTime(visualTime);
        
        // Mark as not playing and stop the scheduler immediately to prevent further updates
        this.state.isPlaying = false;
        this.stopSyncScheduler();
        
        // Stop at the end instead of continuing beyond duration
        if (TransportSyncManager.DEBUG) {
          console.log("[TransportSync] End reached", {
            visualTime: visualTime.toFixed(3),
            duration: effectiveDuration.toFixed(3),
          });
        }
        
        // Call the end callback to handle pause
        if (this.onEndCallback) {
          this.onEndCallback();
        }
        return;
      }
      
      // Clamp visual time to duration even when repeating
      if (visualTime > effectiveDuration) {
        visualTime = effectiveDuration;
      }
      
      // Sync internal state and visual playhead with unified time
      this.state.currentTime = visualTime;
      this.state.nowTime = visualTime; // Update unified time reference
      this.pianoRoll.setTime(visualTime);
      
      // Performance monitoring end
      const updateEnd = performance.now();
      const updateTime = updateEnd - updateStart;
      this.performanceMetrics.updateCount++;
      this.performanceMetrics.totalUpdateTime += updateTime;
      this.performanceMetrics.lastUpdateTime = updateTime;
      
      if (updateTime > 16) { // More than one frame (60fps)
        this.performanceMetrics.slowUpdates++;
        if (TransportSyncManager.DEBUG) {
          console.warn(`[TransportSync] Slow update: ${updateTime.toFixed(2)}ms`);
        }
      }
      
      // Log every 100 updates (disabled by default)
      if (TransportSyncManager.DEBUG && this.performanceMetrics.updateCount % 100 === 0) {
        const avgTime = this.performanceMetrics.totalUpdateTime / this.performanceMetrics.updateCount;
        console.log(`[TransportSync] Performance - Avg: ${avgTime.toFixed(2)}ms, Slow: ${this.performanceMetrics.slowUpdates}/${this.performanceMetrics.updateCount}`);
      }
    };

    // Prefer requestAnimationFrame for smoother updates; fallback to setTimeout
    const useRaf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function' && typeof window.cancelAnimationFrame === 'function';
    if (useRaf) {
      const rafTick = () => {
        performUpdate();
        const effectiveDuration = this.getEffectiveDuration();
        const hasReachedEnd = !this.state.isRepeating && this.state.currentTime >= effectiveDuration;
        if (this.state.isPlaying && token === this._schedulerToken && !hasReachedEnd) {
          this.syncRafId = window.requestAnimationFrame(rafTick) as unknown as number;
        }
      };
      // Start immediately without delay
      rafTick();
    } else {
      const scheduleUpdate = () => {
        performUpdate();
        const effectiveDuration = this.getEffectiveDuration();
        const hasReachedEnd = !this.state.isRepeating && this.state.currentTime >= effectiveDuration;
        if (this.state.isPlaying && token === this._schedulerToken && !hasReachedEnd) {
          this.syncScheduler = (setTimeout as unknown as (h: any, t: number) => number)(
            scheduleUpdate,
            this.options.syncInterval
          ) as unknown as number;
        }
      };
      this.syncScheduler = (setTimeout as unknown as (h: any, t: number) => number)(
        scheduleUpdate,
        this.options.syncInterval
      ) as unknown as number;
    }
  }

  /**
   * Stop playhead synchronization scheduler
   */
  stopSyncScheduler(): void {
    if (this.syncScheduler !== null) {
      clearTimeout(this.syncScheduler);
      this.syncScheduler = null;
    }
    if (this.syncRafId !== null && typeof window !== 'undefined' && window.cancelAnimationFrame) {
      window.cancelAnimationFrame(this.syncRafId);
      this.syncRafId = null;
    }
    // Increment token to invalidate any pending callbacks
    this._schedulerToken++;
  }

  /**
   * Handle transport stop event
   */
  handleTransportStop(pausedTime: number): boolean {
    // Suppress spurious stop events
    if (this.shouldSuppressStop()) {
      return false;
    }

    // Ignore any "stop" callback while the transport still reports itself as running
    if (Tone.getTransport().state !== "stopped") {
      return false;
    }

    const transportSec = Tone.getTransport().seconds;
    const visualSec = (transportSec * this.state.tempo) / this.options.originalTempo;
    
    // Check for stale event
    if (Math.abs(visualSec - this.state.currentTime) > 1) {
      return false;
    }

    if (TransportSyncManager.DEBUG) {
      console.log("[Transport.stop] fired", {
        transportState: Tone.getTransport().state,
        transportSec: transportSec.toFixed(3),
        visualSec: visualSec.toFixed(3),
        currentTime: this.state.currentTime.toFixed(3),
        isSeeking: this.operationState.isSeeking,
        isRestarting: this.operationState.isRestarting,
      });
    }

    this.state.isPlaying = false;
    this.stopSyncScheduler();

    // Update UI immediately to reflect stopped state
    this.pianoRoll.setTime(this.state.currentTime);
    
    return true;
  }

  /**
   * Handle transport pause event
   */
  handleTransportPause(pausedTime: number): void {
    // Similar guard logic for pause events
    if (this.operationState.isSeeking || this.operationState.isRestarting) {
      return;
    }

    this.state.isPlaying = false;
    this.stopSyncScheduler();

    // Update visual position
    const visualTime =
      (pausedTime * this.state.tempo) / this.options.originalTempo;
    this.state.currentTime = visualTime;
    this.pianoRoll.setTime(visualTime);
  }

  /**
   * Handle transport loop event
   */
  handleTransportLoop(loopStartVisual: number | null, loopEndVisual: number | null): void {
    this.operationState.lastLoopJumpTime = Date.now();

    // Extract Transport loop bounds
    const loopStart = Tone.getTransport().loopStart as number;
    const loopEnd = Tone.getTransport().loopEnd as number;

    // Debug log suppressed to avoid main-thread jank during loop boundaries

    // Use immediate timing to ensure clean transition
    const visualStart =
      loopStartVisual !== null ? loopStartVisual : 0;
    this.scheduleVisualUpdate(() => this.pianoRoll.setTime(visualStart));

    // Keep internal state aligned
    this.state.currentTime = visualStart;
  }

  /**
   * Calculate visual time from transport time
   */
  transportToVisualTime(transportSeconds: number): number {
    return (transportSeconds * this.state.tempo) / this.options.originalTempo;
  }

  /**
   * Calculate transport time from visual time
   */
  visualToTransportTime(visualSeconds: number): number {
    return (visualSeconds * this.options.originalTempo) / this.state.tempo;
  }

  /**
   * Calculate transport time from visual time using a specific tempo
   * Useful for tempo changes where we need to calculate with new tempo before updating state
   */
  visualToTransportTimeWithTempo(visualSeconds: number, targetTempo: number): number {
    return (visualSeconds * this.options.originalTempo) / targetTempo;
  }

  /**
   * Update state reference (for when main state object changes)
   */
  updateState(state: AudioPlayerState): void {
    this.state = state;
  }

  /**
   * Update operation state reference
   */
  updateOperationState(operationState: OperationState): void {
    this.operationState = operationState;
  }

  /**
   * Set callback for when playback reaches the end
   */
  setEndCallback(callback: () => void): void {
    this.onEndCallback = callback;
  }
}
