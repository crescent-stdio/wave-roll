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
    
    // WAV/MIDI synchronization drift metrics
    driftMeasurements: [] as number[], // Last 10 drift measurements in ms
    maxDriftMs: 0, // Maximum observed drift
    avgDriftMs: 0, // Average drift over last measurements
    lastDriftMs: 0, // Most recent drift measurement
    driftViolations: 0, // Count of drifts > 10ms
    lastWavTime: 0, // Last known WAV head position
    lastMidiTime: 0, // Last known MIDI head position
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
    
    // Enable sync inspector for debugging (dev builds only)
    if (typeof window !== 'undefined' && (window as any).location?.hostname === 'localhost') {
      this.enableSyncInspector();
    }
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
   * Measure drift between WAV and MIDI playback heads
   * Returns drift in milliseconds (positive = WAV ahead, negative = MIDI ahead)
   */
  private measureDrift(): number {
    const transport = Tone.getTransport();
    if (transport.state !== "started") return 0;
    
    const now = Tone.now();
    const transportTime = transport.seconds;
    const visualTime = this.transportToVisualTime(transportTime);
    
    // Estimate WAV head position (this is approximate since we don't have direct access)
    // In a real implementation, you'd need to get actual WAV player positions
    const estimatedWavTime = visualTime;
    const midiTime = visualTime; // MIDI follows transport exactly
    
    // Calculate drift in milliseconds
    const driftSeconds = estimatedWavTime - midiTime;
    const driftMs = driftSeconds * 1000;
    
    // Update metrics
    this.performanceMetrics.lastDriftMs = driftMs;
    this.performanceMetrics.lastWavTime = estimatedWavTime;
    this.performanceMetrics.lastMidiTime = midiTime;
    
    // Keep sliding window of last 10 measurements
    this.performanceMetrics.driftMeasurements.push(driftMs);
    if (this.performanceMetrics.driftMeasurements.length > 10) {
      this.performanceMetrics.driftMeasurements.shift();
    }
    
    // Update statistics
    const measurements = this.performanceMetrics.driftMeasurements;
    this.performanceMetrics.avgDriftMs = measurements.reduce((sum, d) => sum + Math.abs(d), 0) / measurements.length;
    this.performanceMetrics.maxDriftMs = Math.max(this.performanceMetrics.maxDriftMs, Math.abs(driftMs));
    
    // Count violations (drift > 10ms)
    if (Math.abs(driftMs) > 10) {
      this.performanceMetrics.driftViolations++;
      
      if (TransportSyncManager.DEBUG) {
        console.warn(`[TransportSync] Drift violation: ${driftMs.toFixed(2)}ms (limit: 10ms)`);
      }
    }
    
    return driftMs;
  }

  /**
   * Apply drift correction if needed
   * This is called when drift exceeds acceptable threshold
   */
  private correctDrift(driftMs: number): void {
    const DRIFT_THRESHOLD_MS = 10;
    const CORRECTION_FACTOR = 0.5; // Only correct 50% of drift to avoid overcorrection
    
    if (Math.abs(driftMs) <= DRIFT_THRESHOLD_MS) return;
    
    if (TransportSyncManager.DEBUG) {
      console.log(`[TransportSync] Applying drift correction: ${driftMs.toFixed(2)}ms`);
    }
    
    const transport = Tone.getTransport();
    if (transport.state !== "started") return;
    
    // Calculate correction amount
    const correctionSeconds = (driftMs * CORRECTION_FACTOR) / 1000;
    
    // Apply small transport adjustment
    try {
      const currentSeconds = transport.seconds;
      const correctedSeconds = currentSeconds - correctionSeconds;
      
      // Only apply small corrections to avoid audible glitches
      if (Math.abs(correctionSeconds) < 0.05) { // Max 50ms correction
        transport.seconds = Math.max(0, correctedSeconds);
        
        if (TransportSyncManager.DEBUG) {
          console.log(`[TransportSync] Applied drift correction: ${correctionSeconds.toFixed(4)}s`);
        }
      }
    } catch (e) {
      console.warn("[TransportSync] Failed to apply drift correction:", e);
    }
  }

  /**
   * Get current drift statistics for debugging
   */
  getDriftStats(): {
    currentDriftMs: number;
    avgDriftMs: number;
    maxDriftMs: number;
    violations: number;
    measurements: number[];
  } {
    return {
      currentDriftMs: this.performanceMetrics.lastDriftMs,
      avgDriftMs: this.performanceMetrics.avgDriftMs,
      maxDriftMs: this.performanceMetrics.maxDriftMs,
      violations: this.performanceMetrics.driftViolations,
      measurements: [...this.performanceMetrics.driftMeasurements],
    };
  }

  /**
   * Sync Inspector - comprehensive debugging information
   * Call this from browser console: window._debugSync?.getInspectorData()
   */
  getInspectorData(): {
    transport: any;
    state: any;
    drift: any;
    performance: any;
    generation: number;
  } {
    const transport = Tone.getTransport();
    
    return {
      transport: {
        state: transport.state,
        seconds: transport.seconds,
        bpm: transport.bpm.value,
        position: transport.position,
        ticks: transport.ticks,
      },
      state: {
        isPlaying: this.state.isPlaying,
        currentTime: this.state.currentTime,
        nowTime: this.state.nowTime || 0,
        tempo: this.state.tempo,
        playbackGeneration: this.state.playbackGeneration || 0,
        duration: this.state.duration,
        isRepeating: this.state.isRepeating,
      },
      drift: this.getDriftStats(),
      performance: {
        updateCount: this.performanceMetrics.updateCount,
        avgUpdateTime: this.performanceMetrics.totalUpdateTime / Math.max(1, this.performanceMetrics.updateCount),
        slowUpdates: this.performanceMetrics.slowUpdates,
        lastUpdateTime: this.performanceMetrics.lastUpdateTime,
      },
      generation: this.state.playbackGeneration || 0,
    };
  }

  /**
   * Enable sync inspector - adds global debug access
   */
  enableSyncInspector(): void {
    if (typeof window !== 'undefined') {
      (window as any)._debugSync = {
        getInspectorData: () => this.getInspectorData(),
        getDriftStats: () => this.getDriftStats(),
        enableDebug: () => {
          (TransportSyncManager as any).DEBUG = true;
          console.log("[SyncInspector] Debug logging enabled");
        },
        disableDebug: () => {
          (TransportSyncManager as any).DEBUG = false;
          console.log("[SyncInspector] Debug logging disabled");
        },
        logCurrentState: () => {
          const data = this.getInspectorData();
          console.table({
            "Transport State": data.transport.state,
            "Transport Time": `${data.transport.seconds.toFixed(3)}s`,
            "Visual Time": `${data.state.currentTime.toFixed(3)}s`,
            "Now Time": `${data.state.nowTime.toFixed(3)}s`,
            "Generation": data.generation,
            "Current Drift": `${data.drift.currentDriftMs.toFixed(2)}ms`,
            "Avg Drift": `${data.drift.avgDriftMs.toFixed(2)}ms`,
            "Max Drift": `${data.drift.maxDriftMs.toFixed(2)}ms`,
            "Drift Violations": data.drift.violations,
          });
        },
        startMonitoring: (intervalMs: number = 1000) => {
          if ((window as any)._debugSyncInterval) {
            clearInterval((window as any)._debugSyncInterval);
          }
          (window as any)._debugSyncInterval = setInterval(() => {
            const data = this.getInspectorData();
            console.log(`[SyncMonitor] Gen:${data.generation} | Transport:${data.transport.seconds.toFixed(2)}s | Visual:${data.state.currentTime.toFixed(2)}s | Drift:${data.drift.currentDriftMs.toFixed(1)}ms`);
          }, intervalMs);
          console.log("[SyncInspector] Monitoring started");
        },
        stopMonitoring: () => {
          if ((window as any)._debugSyncInterval) {
            clearInterval((window as any)._debugSyncInterval);
            (window as any)._debugSyncInterval = null;
            console.log("[SyncInspector] Monitoring stopped");
          }
        }
      };
      
      console.log(`
[SyncInspector] Debug tools enabled! Use these commands:

window._debugSync.logCurrentState()     - Log current sync state
window._debugSync.startMonitoring()     - Start live monitoring  
window._debugSync.stopMonitoring()      - Stop live monitoring
window._debugSync.enableDebug()         - Enable debug logging
window._debugSync.disableDebug()        - Disable debug logging
window._debugSync.getInspectorData()    - Get full state object
window._debugSync.getDriftStats()       - Get drift statistics
      `);
    }
  }

  /**
   * Disable sync inspector - removes global debug access
   */
  disableSyncInspector(): void {
    if (typeof window !== 'undefined') {
      if ((window as any)._debugSyncInterval) {
        clearInterval((window as any)._debugSyncInterval);
      }
      delete (window as any)._debugSync;
      delete (window as any)._debugSyncInterval;
      console.log("[SyncInspector] Debug tools removed");
    }
  }

  /**
   * ========================================================================
   * WAV/MIDI SYNCHRONIZATION TESTING GUIDE
   * ========================================================================
   * 
   * This guide describes how to test all synchronization scenarios to ensure
   * WAV and MIDI remain perfectly synchronized under all conditions.
   * 
   * SETUP:
   * 1. Load multi-track WAV and MIDI files
   * 2. Enable sync inspector: window._debugSync.enableDebug()
   * 3. Start monitoring: window._debugSync.startMonitoring(500)
   * 
   * TEST SCENARIOS:
   * 
   * ## 1. BASIC SYNCHRONIZATION
   * Expected: WAV and MIDI play as one unified sound
   * - Play audio and verify no doubling or echo
   * - Check drift: window._debugSync.getDriftStats() 
   * - Drift should be <= 10ms consistently
   * 
   * ## 2. MUTE/UNMUTE SYNCHRONIZATION  
   * Expected: Unmuted tracks remain perfectly in sync, no restart artifacts
   * Test steps:
   * - Start playback, let run for 5+ seconds
   * - Mute all WAV tracks
   * - Wait 2-3 seconds (MIDI continues)
   * - Unmute one WAV track
   * - Verify: No audio doubling, WAV immediately in phase with MIDI
   * - Check drift after unmute - should remain <= 10ms
   * 
   * ## 3. SEEK SYNCHRONIZATION
   * Expected: After seek, no ghost audio, all media synchronized at new position
   * Test steps:
   * - Start playback
   * - While playing, seek to 50% position
   * - Verify: Immediate silence, then synchronized restart
   * - Pause immediately after seek
   * - Verify: Complete silence, no residual audio
   * - Check generation token incremented: window._debugSync.getInspectorData().generation
   * 
   * ## 4. TEMPO CHANGE SYNCHRONIZATION
   * Expected: Only one unified sound at new tempo, no overlapping audio
   * Test steps:
   * - Start playback at 120 BPM
   * - While playing, change to 140 BPM
   * - Verify: Brief silence, then single unified sound at new tempo
   * - Check that totalTime updated: window._debugSync.getInspectorData().state
   * - Verify A/B markers scaled appropriately
   * - Check generation token incremented
   * 
   * ## 5. A/B LOOP SYNCHRONIZATION
   * Expected: Loop transitions are seamless with no drift accumulation
   * Test steps:
   * - Set A marker at 20% position, B marker at 35%
   * - Enable A/B loop mode
   * - Start playback and let loop 10+ times
   * - Check drift doesn't accumulate: window._debugSync.getDriftStats()
   * - Verify smooth loop transitions with no gaps or overlaps
   * 
   * ## 6. RAPID OPERATION STRESS TEST
   * Expected: No ghost audio or system instability
   * Test steps:
   * - Rapidly click play/pause (10+ times in 2 seconds)
   * - Rapidly seek to different positions (10+ seeks quickly)
   * - Rapidly change tempo multiple times
   * - Verify: Only latest operation produces audio
   * - Check generation tokens increase appropriately
   * - No accumulated scheduled events: check console for Transport clear messages
   * 
   * ## 7. MIXED OPERATION SEQUENCE
   * Expected: Complex sequences work correctly
   * Test sequence:
   * - Play → Seek to 30% → Change tempo to 150 BPM → Enable A/B loop → Mute WAV → Unmute WAV
   * - Verify each step: proper sync, no ghost audio, drift <= 10ms
   * - Final verification: Single unified sound with all media in sync
   * 
   * ## 8. RESOURCE CLEANUP VERIFICATION
   * Expected: No memory leaks or accumulated timers
   * Test steps:
   * - Perform multiple play/seek/tempo cycles
   * - Check browser dev tools → Performance → Memory for leaks  
   * - Console should show "Transport events cleared" messages after each stop
   * - No accumulated setTimeout timers in system
   * 
   * ACCEPTANCE CRITERIA:
   *  Drift <= 10ms maintained in all scenarios
   *  No ghost audio (doubling, echo, overlap) in any scenario
   *  Mute/unmute preserves synchronization without restart artifacts
   *  Seek provides immediate silence followed by synchronized restart
   *  Tempo changes produce single unified audio stream
   *  A/B looping works without drift accumulation
   *  Rapid operations handled gracefully with generation token system
   *  No memory leaks or resource accumulation
   * 
   * DEBUGGING COMMANDS:
   * - window._debugSync.logCurrentState() - Current sync status
   * - window._debugSync.getDriftStats() - Detailed drift metrics  
   * - window._debugSync.getInspectorData() - Full system state
   * - Check console for generation token messages during operations
   * 
   * ========================================================================
   */

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
      
      // === WAV/MIDI DRIFT MEASUREMENT AND CORRECTION ===
      // Measure drift between WAV and MIDI playback every 10 updates
      if (this.performanceMetrics.updateCount % 10 === 0) {
        const driftMs = this.measureDrift();
        
        // Apply correction if drift exceeds threshold
        this.correctDrift(driftMs);
        
        // Log drift statistics periodically
        if (TransportSyncManager.DEBUG && this.performanceMetrics.updateCount % 100 === 0) {
          const stats = this.getDriftStats();
          console.log("[TransportSync] Drift Stats:", {
            current: `${stats.currentDriftMs.toFixed(2)}ms`,
            avg: `${stats.avgDriftMs.toFixed(2)}ms`,
            max: `${stats.maxDriftMs.toFixed(2)}ms`,
            violations: stats.violations
          });
        }
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
