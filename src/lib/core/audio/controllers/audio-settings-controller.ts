/**
 * Audio Settings Controller
 * Handles volume, pan, tempo, and playback rate adjustments
 */

import * as Tone from "tone";
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
  onVolumeChange?: () => void;
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
    state.tempo = clampedTempo;
    
    // Keep playbackRate in sync with tempo relative to originalTempo
    const ratePct = (clampedTempo / originalTempo) * 100;
    state.playbackRate = ratePct;

    if (state.isPlaying) {
      // Restart-style tempo change to flush scheduled events and avoid overlap
      operationState.isSeeking = true;
      operationState.isRestarting = true;

      const currentVisualTime = state.currentTime;
      const newTransportSeconds = (currentVisualTime * originalTempo) / clampedTempo;

      // Rescale A-B loop window to preserve transport-anchored positions
      loopManager.rescaleLoopForTempoChange(oldTempo, clampedTempo, state.duration);

      // Stop sync and Part, then fully reset Transport
      transportSyncManager.stopSyncScheduler();
      samplerManager.stopPart();

      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel();
      transport.bpm.value = clampedTempo;

      // Configure loop window under new tempo
      loopManager.configureTransportLoop(state.isRepeating, state, state.duration);

      // Set transport to new position
      transport.seconds = newTransportSeconds;

      // Rebuild Part
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

      // Schedule synchronized start for both Transport/Part and WAV
      const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
      const startAt = Tone.now() + RESTART_DELAY;
      transport.start(startAt);
      samplerManager.startPart(startAt, newTransportSeconds);

      // WAV speed + start
      try { wavPlayerManager.setPlaybackRate(ratePct); } catch {}
      try {
        wavPlayerManager.stopAllAudioPlayers();
        wavPlayerManager.startActiveAudioAt(currentVisualTime, startAt);
      } catch {}

      state.isPlaying = true;
      transportSyncManager.startSyncScheduler();

      setTimeout(() => {
        operationState.isSeeking = false;
        operationState.isRestarting = false;
      }, 100);
    } else {
      // Not playing - just update tempo
      Tone.getTransport().bpm.value = clampedTempo;
      
      // Update WAV playback rate for when it starts
      try { wavPlayerManager.setPlaybackRate(ratePct); } catch {}
      
      // Rescale loop points
      loopManager.rescaleLoopForTempoChange(oldTempo, clampedTempo, state.duration);
      loopManager.configureTransportLoop(state.isRepeating, state, state.duration);
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
    
    const oldTempo = state.tempo;
    state.tempo = clampedTempo;
    state.playbackRate = finalRate;

    if (state.isPlaying) {
      // Same logic as setTempo for playing state
      operationState.isSeeking = true;
      operationState.isRestarting = true;

      const currentVisualTime = state.currentTime;
      const newTransportSeconds = (currentVisualTime * originalTempo) / clampedTempo;

      loopManager.rescaleLoopForTempoChange(oldTempo, clampedTempo, state.duration);

      transportSyncManager.stopSyncScheduler();
      samplerManager.stopPart();

      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel();
      transport.bpm.value = clampedTempo;

      loopManager.configureTransportLoop(state.isRepeating, state, state.duration);
      transport.seconds = newTransportSeconds;

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

      const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
      const startAt = Tone.now() + RESTART_DELAY;
      transport.start(startAt);
      samplerManager.startPart(startAt, newTransportSeconds);

      try { wavPlayerManager.setPlaybackRate(finalRate); } catch {}
      try {
        wavPlayerManager.stopAllAudioPlayers();
        wavPlayerManager.startActiveAudioAt(currentVisualTime, startAt);
      } catch {}

      state.isPlaying = true;
      transportSyncManager.startSyncScheduler();

      setTimeout(() => {
        operationState.isSeeking = false;
        operationState.isRestarting = false;
      }, 100);
    } else {
      Tone.getTransport().bpm.value = clampedTempo;
      
      try { wavPlayerManager.setPlaybackRate(finalRate); } catch {}
      
      loopManager.rescaleLoopForTempoChange(oldTempo, clampedTempo, state.duration);
      loopManager.configureTransportLoop(state.isRepeating, state, state.duration);
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

    const wasPlaying = state.isPlaying;
    const currentVisualTime = state.currentTime;

    // Validate and set loop points
    if (start !== null && end !== null && start >= end) {
      console.warn("[AudioSettingsController.setLoopPoints] Invalid loop points: start >= end");
      return;
    }

    // Set the loop points
    loopManager.setLoopPoints(start, end, state.duration);

    // Get the effective loop bounds
    const effectiveStart = loopManager.loopStartVisual ?? 0;
    const effectiveEnd = loopManager.loopEndVisual ?? state.duration;

    // Configure transport loop
    loopManager.configureTransportLoop(state.isRepeating, state, state.duration);

    // Rebuild the Part with new loop bounds
    if (wasPlaying) {
      operationState.isSeeking = true;

      transportSyncManager.stopSyncScheduler();
      samplerManager.stopPart();

      const transport = Tone.getTransport();
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

      const transportSeconds = transportSyncManager.visualToTransportTime(newPosition);
      transport.seconds = transportSeconds;
      state.currentTime = newPosition;

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
      samplerManager.startPart(startAt, transportSeconds);

      if (wavPlayerManager.isAudioActive()) {
        wavPlayerManager.stopAllAudioPlayers();
        wavPlayerManager.startActiveAudioAt(newPosition, startAt);
      }

      state.isPlaying = true;
      transportSyncManager.startSyncScheduler();

      setTimeout(() => {
        operationState.isSeeking = false;
      }, 100);
    } else {
      // Not playing - just update position if needed
      if (!preservePosition || currentVisualTime < effectiveStart || currentVisualTime >= effectiveEnd) {
        const newPosition = effectiveStart;
        const transportSeconds = transportSyncManager.visualToTransportTime(newPosition);
        Tone.getTransport().seconds = transportSeconds;
        state.currentTime = newPosition;
      }
    }
  }
}