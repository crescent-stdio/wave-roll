/**
 * Audio Settings Controller
 * Handles volume, pan, tempo, and playback rate adjustments
 */

import * as Tone from "tone";
import { ensureAudioContextReady } from "../utils/audio-context";
import { clamp } from "../../utils";
import { AudioPlayerState, AUDIO_CONSTANTS, OperationState } from "../player-types";
import { SamplerManager } from "../managers/sampler-manager";
import { WavPlayerManager } from "../managers/wav-player-manager";
import { TransportSyncManager } from "../managers/transport-sync-manager";
import { LoopManager } from "../managers/loop-manager";

export interface AudioSettingsControllerDeps {
  state: AudioPlayerState;
  operationState: OperationState;
  samplerManager: SamplerManager;
  wavPlayerManager: WavPlayerManager;
  transportSyncManager: TransportSyncManager;
  loopManager: LoopManager;
  originalTempo: number;
  options: { volume?: number; repeat?: boolean };
  pianoRoll: { setTime(time: number): void };
  onVolumeChange?: () => void;
  onVisualUpdate?: (params: { currentTime: number; duration: number; isPlaying: boolean }) => void;
}

export class AudioSettingsController {
  private deps: AudioSettingsControllerDeps;

  constructor(deps: AudioSettingsControllerDeps) {
    this.deps = deps;
  }

  /**
   * Set playback volume
   */
  setVolume(volume: number): void {
    const clamped = clamp(volume, 0, 1);
    console.log("[AudioSettingsController.setVolume]", { volume, clamped });

    this.deps.samplerManager.setVolume(clamped);
    this.deps.wavPlayerManager.setVolume(clamped);

    this.deps.state.volume = clamped;
    this.deps.options.volume = clamped;

    // Notify of volume change
    if (this.deps.onVolumeChange) {
      this.deps.onVolumeChange();
    }
  }

  /**
   * Set stereo pan
   */
  setPan(pan: number): void {
    const clamped = clamp(pan, -1, 1);
    console.log("[AudioSettingsController.setPan]", { pan, clamped });

    this.deps.samplerManager.setPan(clamped);
    this.deps.state.pan = clamped;
  }

  /**
   * Set playback tempo
   */
  setTempo(bpm: number): void {
    const { state, operationState, samplerManager, wavPlayerManager, transportSyncManager, loopManager, originalTempo } = this.deps;
    
    const clampedTempo = clamp(bpm, AUDIO_CONSTANTS.MIN_TEMPO, AUDIO_CONSTANTS.MAX_TEMPO);
    const oldTempo = state.tempo;
    
    // Increment generation token to prevent ghost audio
    state.playbackGeneration = (state.playbackGeneration || 0) + 1;
    
    // Update state atomically
    state.tempo = clampedTempo;
    state.nowTime = state.currentTime; // Update unified time reference
    
    // Keep playbackRate in sync with tempo relative to originalTempo
    const ratePct = (clampedTempo / originalTempo) * 100;
    state.playbackRate = ratePct;
    
    // Update totalTime based on tempo change
    state.totalTime = state.duration * (originalTempo / clampedTempo);

    console.log("[AudioSettingsController] Atomic tempo change:", {
      oldTempo,
      newTempo: clampedTempo,
      generation: state.playbackGeneration,
      ratePct
    });

    if (state.isPlaying) {
      // Ensure AudioContext is running (safety in browsers)
      try { void ensureAudioContextReady(); } catch {}
      
      // Mark as seeking/restarting for UI feedback
      operationState.isSeeking = true;
      operationState.isRestarting = true;

      const currentVisualTime = state.currentTime;
      const newTransportSeconds = transportSyncManager.visualToTransportTimeWithTempo(currentVisualTime, clampedTempo);

      console.log("[AudioSettingsController] Stopping all audio atomically");
      
      // === ATOMIC STOP PHASE ===
      // Stop everything synchronously to prevent audio leakage
      transportSyncManager.stopSyncScheduler();
      samplerManager.stopPart();
      
      // Stop and fully clear WAV players immediately
      wavPlayerManager.stopAllAudioPlayers();
      
      // Stop transport and clear all scheduled events
      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel();
      
      // Kill any remaining voices immediately 
      try { samplerManager.stopAllVoicesImmediate(); } catch {}
      try { samplerManager.hardMuteAllGates(); } catch {}

      // === ATOMIC UPDATE PHASE ===
      // Update transport settings
      transport.bpm.value = clampedTempo;
      transport.seconds = newTransportSeconds;
      
      // Rescale A-B loop window to preserve transport-anchored positions
      loopManager.rescaleLoopForTempoChange(oldTempo, clampedTempo, state.duration);
      loopManager.configureTransportLoop(state.isRepeating, state, state.duration);

      // Update WAV playback rate before starting
      try { wavPlayerManager.setPlaybackRate(ratePct); } catch {}

      // Rebuild Part with new settings
      samplerManager.setupNotePart(
        loopManager.loopStartVisual,
        loopManager.loopEndVisual,
        {
          repeat: this.deps.options.repeat,
          duration: state.duration,
          tempo: clampedTempo,
          originalTempo: originalTempo,
        }
      );

      // === ATOMIC START PHASE ===
      // Schedule synchronized restart for perfect timing
      const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
      const startAt = Tone.now() + RESTART_DELAY;
      
      console.log("[AudioSettingsController] Starting synchronized restart at", startAt);
      
      // Unmute gates just before starting
      try { samplerManager.hardUnmuteAllGates(); } catch {}
      
      // Start transport
      transport.start(startAt);
      
      // Start MIDI Part
      samplerManager.startPart(startAt, newTransportSeconds);

      // Start WAV audio using Tone.js scheduling
      if (wavPlayerManager.isAudioActive()) {
        wavPlayerManager.startActiveAudioAtSync(currentVisualTime, startAt);
      }

      // Resume state management
      state.isPlaying = true;
      transportSyncManager.startSyncScheduler();

      // Clear operation flags after settling time
      setTimeout(() => {
        operationState.isSeeking = false;
        operationState.isRestarting = false;
      }, 100);
      
      console.log("[AudioSettingsController] Atomic tempo change completed");
    } else {
      // Not playing - just update tempo without restart
      Tone.getTransport().bpm.value = clampedTempo;
      
      // Update WAV playback rate for when it starts
      try { wavPlayerManager.setPlaybackRate(ratePct); } catch {}
      
      // Rescale loop points
      loopManager.rescaleLoopForTempoChange(oldTempo, clampedTempo, state.duration);
      loopManager.configureTransportLoop(state.isRepeating, state, state.duration);
      
      // Trigger UI update when paused
      if (this.deps.onVisualUpdate) {
        this.deps.onVisualUpdate({
          currentTime: state.currentTime,
          duration: state.duration,
          isPlaying: state.isPlaying,
        });
      }
    }
  }

  /**
   * Set playback rate as percentage (10-200, 100 = normal speed)
   */
  setPlaybackRate(rate: number): void {
    const { state, operationState, samplerManager, wavPlayerManager, transportSyncManager, loopManager, originalTempo } = this.deps;
    
    const clampedRate = clamp(rate, AUDIO_CONSTANTS.MIN_RATE, AUDIO_CONSTANTS.MAX_RATE);
    
    // Convert rate percentage to BPM
    const newTempo = (originalTempo * clampedRate) / 100;
    const clampedTempo = clamp(newTempo, AUDIO_CONSTANTS.MIN_TEMPO, AUDIO_CONSTANTS.MAX_TEMPO);
    
    // Recalculate rate based on clamped tempo
    const finalRate = (clampedTempo / originalTempo) * 100;
    
    // Increment generation token to prevent ghost audio
    state.playbackGeneration = (state.playbackGeneration || 0) + 1;
    
    const oldTempo = state.tempo;
    
    // Update state atomically
    state.tempo = clampedTempo;
    state.playbackRate = finalRate;
    state.nowTime = state.currentTime; // Update unified time reference
    
    console.log("[AudioSettingsController] Atomic playback rate change:", {
      oldRate: (oldTempo / originalTempo) * 100,
      newRate: finalRate,
      generation: state.playbackGeneration
    });

    // Helper function to trigger UI update consistently
    const triggerUIUpdate = (newPosition: number) => {
      if (this.deps.onVisualUpdate) {
        this.deps.onVisualUpdate({
          currentTime: newPosition,
          duration: state.duration,
          isPlaying: state.isPlaying,
        });
      }
      // Also sync piano-roll immediately for snappy feedback
      try { this.deps.pianoRoll?.setTime(newPosition); } catch {}
    };

    if (state.isPlaying) {
      try { void ensureAudioContextReady(); } catch {}
      
      // Mark as seeking/restarting for UI feedback
      operationState.isSeeking = true;
      operationState.isRestarting = true;

      const currentVisualTime = state.currentTime;
      const newTransportSeconds = transportSyncManager.visualToTransportTimeWithTempo(currentVisualTime, clampedTempo);

      console.log("[AudioSettingsController] Stopping all audio atomically for rate change");
      
      // === ATOMIC STOP PHASE ===
      transportSyncManager.stopSyncScheduler();
      samplerManager.stopPart();
      
      // Stop WAV players immediately
      wavPlayerManager.stopAllAudioPlayers();

      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel();
      
      // Kill any remaining voices immediately 
      try { samplerManager.stopAllVoicesImmediate(); } catch {}
      try { samplerManager.hardMuteAllGates(); } catch {}

      // === ATOMIC UPDATE PHASE ===
      // Update transport settings
      transport.bpm.value = clampedTempo;
      transport.seconds = newTransportSeconds;
      
      // Rescale loop points
      loopManager.rescaleLoopForTempoChange(oldTempo, clampedTempo, state.duration);
      loopManager.configureTransportLoop(state.isRepeating, state, state.duration);

      // Update visual position immediately before restarting
      this.deps.pianoRoll.setTime(currentVisualTime);
      triggerUIUpdate(currentVisualTime);

      // Update WAV playback rate before starting
      try { wavPlayerManager.setPlaybackRate(finalRate); } catch {}

      // Rebuild Part with new settings
      samplerManager.setupNotePart(
        loopManager.loopStartVisual,
        loopManager.loopEndVisual,
        {
          repeat: this.deps.options.repeat,
          duration: state.duration,
          tempo: clampedTempo,
          originalTempo: originalTempo,
        }
      );

      // === ATOMIC START PHASE ===
      // Schedule synchronized restart for perfect timing
      const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
      const startAt = Tone.now() + RESTART_DELAY;
      
      console.log("[AudioSettingsController] Starting synchronized restart for rate change at", startAt);
      
      // Unmute gates just before starting
      try { samplerManager.hardUnmuteAllGates(); } catch {}
      
      // Start transport
      transport.start(startAt);
      
      // Start MIDI Part 
      samplerManager.startPart(startAt, newTransportSeconds);

      // Start WAV audio using synchronized scheduling
      if (wavPlayerManager.isAudioActive()) {
        wavPlayerManager.startActiveAudioAtSync(currentVisualTime, startAt);
      }

      // Resume state management
      state.isPlaying = true;
      transportSyncManager.startSyncScheduler();

      setTimeout(() => {
        operationState.isSeeking = false;
        operationState.isRestarting = false;
        // Trigger another UI update after restart completes
        triggerUIUpdate(state.currentTime);
      }, 100);
      
      console.log("[AudioSettingsController] Atomic rate change completed");
    } else {
      // Not playing - just update rate without restart
      Tone.getTransport().bpm.value = clampedTempo;
      
      try { wavPlayerManager.setPlaybackRate(finalRate); } catch {}
      
      loopManager.rescaleLoopForTempoChange(oldTempo, clampedTempo, state.duration);
      loopManager.configureTransportLoop(state.isRepeating, state, state.duration);
      
      // Trigger UI update when paused so seekbar/time reflect new rate
      triggerUIUpdate(state.currentTime);
    }
  }

  /**
   * Set custom A-B loop points
   */
  setLoopPoints(
    start: number | null,
    end: number | null,
    preservePosition: boolean = false
  ): void {
    const { state, operationState, samplerManager, wavPlayerManager, transportSyncManager, loopManager } = this.deps;
    
    console.log("[AudioSettingsController.setLoopPoints]", { start, end, preservePosition });

    // Re-entrancy guard: ignore overlapping requests
    if (operationState.isSeeking || operationState.isRestarting) {
      return;
    }

    const wasPlaying = state.isPlaying;
    const currentVisualTime = state.currentTime;

    // UX policy: A-only should NOT activate a loop window.
    // Interpret (A set, B null) as "clear loop" while preserving position
    // to avoid unexpected jumps.
    if (start !== null && end === null) {
      start = null;
      end = null;
      preservePosition = true;
    }

    // Validate and set loop points
    if (start !== null && end !== null && start >= end) {
      console.warn("[AudioSettingsController.setLoopPoints] Invalid loop points: start >= end");
      return;
    }

    // Set the loop points (setLoopPoints requires 4 parameters)
    const res = loopManager.setLoopPoints(start, end, state.duration, state);

    // Get the effective loop bounds
    const effectiveStart = loopManager.loopStartVisual ?? 0;
    const effectiveEnd = loopManager.loopEndVisual ?? state.duration;

    // Configure transport loop
    loopManager.configureTransportLoop(state.isRepeating, state, state.duration);

    // Determine if this call clears the loop window entirely
    const isClearing = start === null && end === null;

    // If nothing actually changed, just refresh UI/transport loop config and exit
    if (!res.changed) {
      loopManager.configureTransportLoop(state.isRepeating, state, state.duration);
      if (this.deps.onVisualUpdate) {
        this.deps.onVisualUpdate({
          currentTime: state.currentTime,
          duration: state.duration,
          isPlaying: state.isPlaying,
        });
      }
      try { this.deps.pianoRoll?.setTime(state.currentTime); } catch {}
      return;
    }

    // Helper function to trigger UI update consistently
    const triggerUIUpdate = (newPosition: number) => {
      if (this.deps.onVisualUpdate) {
        this.deps.onVisualUpdate({
          currentTime: newPosition,
          duration: state.duration,
          isPlaying: state.isPlaying,
        });
      }
      // Also sync piano-roll immediately for snappy feedback
      try { this.deps.pianoRoll?.setTime(newPosition); } catch {}
    };

    // Rebuild the Part with new loop bounds
    if (wasPlaying) {
      operationState.isSeeking = true;

      transportSyncManager.stopSyncScheduler();
      samplerManager.stopPart();

      const transport = Tone.getTransport();
      // Capture BEFORE stopping to preserve anchor when clearing with preservePosition
      const prevTransportSeconds = transport.seconds;
      transport.stop();
      transport.cancel();

      // Determine new position
      let newPosition = currentVisualTime;
      if (!preservePosition) {
        // Move to loop start if not preserving position
        newPosition = effectiveStart;
      } else if (currentVisualTime < effectiveStart || currentVisualTime >= effectiveEnd) {
        // If outside loop bounds, move to start
        newPosition = effectiveStart;
      }

      // For clearing loop while preserving position, keep the exact current
      // transport time to avoid audible jumps to 0.
      const transportSeconds = (isClearing && preservePosition)
        ? prevTransportSeconds
        : transportSyncManager.visualToTransportTime(newPosition);
      transport.seconds = transportSeconds;
      state.currentTime = newPosition;
      
      // Update visual position immediately
      this.deps.pianoRoll.setTime(newPosition);
      
      // Trigger UI update callback for seek bar and time display immediately
      triggerUIUpdate(newPosition);

      // Rebuild Part with new bounds
      samplerManager.setupNotePart(
        loopManager.loopStartVisual,
        loopManager.loopEndVisual,
        {
          repeat: this.deps.options.repeat,
          duration: state.duration,
          tempo: state.tempo,
          originalTempo: this.deps.originalTempo,
        }
      );

      // Restart playback
      const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
      const startAt = Tone.now() + RESTART_DELAY;
      transport.start(startAt);
      
      // Calculate relative offset for Part (within loop window)
      const relativeVisualOffset = loopManager.getPartOffset(newPosition, transportSeconds);
      const relativeTransportOffset = transportSyncManager.visualToTransportTime(relativeVisualOffset);
      samplerManager.startPart(startAt, relativeTransportOffset);

      if (wavPlayerManager.isAudioActive()) {
        wavPlayerManager.stopAllAudioPlayers();
        wavPlayerManager.startActiveAudioAt(newPosition, startAt);
      }

      state.isPlaying = true;
      transportSyncManager.startSyncScheduler();

      setTimeout(() => {
        operationState.isSeeking = false;
        // Trigger another UI update after restart completes to ensure continuity
        triggerUIUpdate(state.currentTime);
      }, 100);
    } else {
      // Not playing - just update position if needed
      if (isClearing && preservePosition) {
        // Do not move the playhead; only clear loop markers
        triggerUIUpdate(currentVisualTime);
      } else if (!preservePosition || currentVisualTime < effectiveStart || currentVisualTime >= effectiveEnd) {
        const newPosition = effectiveStart;
        const transportSeconds = transportSyncManager.visualToTransportTime(newPosition);
        Tone.getTransport().seconds = transportSeconds;
        state.currentTime = newPosition;
        
        // Update visual position immediately
        this.deps.pianoRoll.setTime(newPosition);
        
        // Trigger UI update callback for seek bar and time display
        triggerUIUpdate(newPosition);
      }
    }
  }
}
