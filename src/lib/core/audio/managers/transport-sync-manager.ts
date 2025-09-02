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
  private pianoRoll: PianoRollSync;
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

    // Force initial sync to current position
    const initialSync = () => {
      const transport = Tone.getTransport();
      const transportTime = transport.seconds;
      // Visual time calculation using state.tempo which now reflects playback rate
      const visualTime =
        (transportTime * this.state.tempo) / this.options.originalTempo;

      // Prevent the playhead from jumping backwards when a new sync-scheduler starts
      const TOLERANCE_SEC = 1;
      if (visualTime < this.state.currentTime - TOLERANCE_SEC) {
        // Stale - keep existing position and let the first performUpdate()
        // correct things once Transport.seconds has settled.
        return;
      }

      // Update state and visual
      this.state.currentTime = visualTime;
      this.pianoRoll.setTime(visualTime);
    };

    // Perform initial sync immediately
    initialSync();

    const performUpdate = () => {
      // Ignore callbacks from an outdated scheduler
      if (token !== this._schedulerToken) {
        return;
      }
      if (!this.state.isPlaying || this.operationState.isSeeking) {
        return;
      }

      const transport = Tone.getTransport();
      // Skip update if transport is not actually running yet
      if (transport.state !== "started") {
        return;
      }

      const transportTime = transport.seconds;

      // Visual time calculation using state.tempo which now reflects playback rate
      const visualTime =
        (transportTime * this.state.tempo) / this.options.originalTempo;
      
      // Sync internal state and visual playhead
      this.state.currentTime = visualTime;
      this.pianoRoll.setTime(visualTime);

      // Auto-pause when playback ends and repeat is off
      if (!this.state.isRepeating && visualTime >= this.state.duration) {
        // Stop at the end instead of continuing beyond duration
        console.log("[TransportSync] End reached", {
          visualTime: visualTime.toFixed(3),
          duration: this.state.duration.toFixed(3),
        });
        // Call the end callback to handle pause
        if (this.onEndCallback) {
          this.onEndCallback();
        }
        return;
      }
    };

    const scheduleUpdate = () => {
      performUpdate();
      // Continue scheduling only if playing and token is still valid
      if (this.state.isPlaying && token === this._schedulerToken) {
        this.syncScheduler = window.setTimeout(
          scheduleUpdate,
          this.options.syncInterval
        );
      }
    };

    // Start the update loop after a brief delay to allow Transport to stabilize
    this.syncScheduler = window.setTimeout(
      scheduleUpdate,
      this.options.syncInterval
    );
  }

  /**
   * Stop playhead synchronization scheduler
   */
  stopSyncScheduler(): void {
    if (this.syncScheduler !== null) {
      clearTimeout(this.syncScheduler);
      this.syncScheduler = null;
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

    console.log("[Transport.stop] fired", {
      transportState: Tone.getTransport().state,
      transportSec: transportSec.toFixed(3),
      visualSec: visualSec.toFixed(3),
      currentTime: this.state.currentTime.toFixed(3),
      isSeeking: this.operationState.isSeeking,
      isRestarting: this.operationState.isRestarting,
    });

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

    console.log("[Transport.loop] A-B loop started", {
      loopStart: loopStart.toFixed(3),
      loopEnd: loopEnd.toFixed(3),
      visualStart: loopStartVisual,
      visualEnd: loopEndVisual,
    });

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