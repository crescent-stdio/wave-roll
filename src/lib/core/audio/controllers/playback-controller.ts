/**
 * Playback Controller
 * Handles core transport operations: play, pause, seek, restart
 */

import * as Tone from "tone";
import { clamp } from "../../utils";
import { AudioPlayerState, AUDIO_CONSTANTS, OperationState } from "../player-types";
import { SamplerManager } from "../managers/sampler-manager";
import { WavPlayerManager } from "../managers/wav-player-manager";
import { TransportSyncManager } from "../managers/transport-sync-manager";
import { LoopManager } from "../managers/loop-manager";

export interface PlaybackControllerDeps {
  state: AudioPlayerState;
  operationState: OperationState;
  samplerManager: SamplerManager;
  wavPlayerManager: WavPlayerManager;
  transportSyncManager: TransportSyncManager;
  loopManager: LoopManager;
  originalTempo: number;
  options: { repeat?: boolean };
  pianoRoll: { setTime(time: number): void };
  onPlaybackEnd?: () => void;
  uiSync?: (time: number, force?: boolean) => void;
}

export class PlaybackController {
  private deps: PlaybackControllerDeps;
  private pausedTime = 0;
  private _playLock = false;

  constructor(deps: PlaybackControllerDeps) {
    this.deps = deps;
  }

  /**
   * Start or resume playback
   */
  async play(): Promise<void> {
    if (this._playLock) {
      console.log("[PlaybackController.play] Already in play(), ignoring");
      return;
    }
    this._playLock = true;

    try {
      const { state, samplerManager, wavPlayerManager, transportSyncManager, loopManager } = this.deps;

      if (state.isPlaying) {
        console.log("[PlaybackController.play] Already playing");
        return;
      }

      // Ensure Tone.js context is started
      if (Tone.context.state === "suspended") {
        await Tone.start();
        console.log("[PlaybackController] Audio context started");
      }

      // Handle play-after-end: rewind to start (0) and start playback
      // Also handle case where we're at the end and repeating is on
      if (state.currentTime >= state.duration - 0.001) {
        this.pausedTime = 0;
        state.currentTime = 0;
        // Update visual immediately
        this.deps.pianoRoll.setTime(0);
      }

      // Setup transport and parts
      const transport = Tone.getTransport();
      transport.seconds = this.pausedTime;

      // Setup Part with current loop points
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

      // Start transport and part at an absolute AudioContext time
      const startAt = Tone.now() + AUDIO_CONSTANTS.LOOKAHEAD_TIME;
      transport.start(startAt);
      // Compute part offset relative to current loop window (visual -> transport)
      const visualAtStart = transportSyncManager.transportToVisualTime(this.pausedTime);
      const relativeVisualOffset = loopManager.getPartOffset(visualAtStart, this.pausedTime);
      const relativeTransportOffset = transportSyncManager.visualToTransportTime(relativeVisualOffset);
      samplerManager.startPart(startAt, relativeTransportOffset);

      // Start external audio if needed
      if (wavPlayerManager.isAudioActive()) {
        const visualOffset = transportSyncManager.transportToVisualTime(this.pausedTime);
        wavPlayerManager.startActiveAudioAt(visualOffset, "+0.01");
      }

      state.isPlaying = true;
      transportSyncManager.startSyncScheduler();
    } finally {
      this._playLock = false;
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    const { state, samplerManager, wavPlayerManager, transportSyncManager } = this.deps;

    if (!state.isPlaying) {
      console.log("[PlaybackController.pause] Not playing");
      return;
    }

    // Stop sync first
    transportSyncManager.stopSyncScheduler();

    // Save position before stopping
    this.pausedTime = Tone.getTransport().seconds;

    // Stop transport and parts
    samplerManager.stopPart();
    Tone.getTransport().pause();

    // Stop external audio
    wavPlayerManager.stopAllAudioPlayers();

    state.isPlaying = false;
    state.currentTime = transportSyncManager.transportToVisualTime(this.pausedTime);
  }

  /**
   * Stop and restart from beginning
   */
  restart(): void {
    const { state, operationState, samplerManager, wavPlayerManager, transportSyncManager, loopManager, pianoRoll } = this.deps;

    operationState.isRestarting = true;

    // Stop everything
    transportSyncManager.stopSyncScheduler();
    samplerManager.stopPart();
    wavPlayerManager.stopAllAudioPlayers();

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();

    // Reset to beginning
    const loopStart = loopManager.loopStartVisual ?? 0;
    transport.seconds = transportSyncManager.visualToTransportTime(loopStart);
    this.pausedTime = transport.seconds;

    state.currentTime = loopStart;
    pianoRoll.setTime(loopStart);

    // If was playing, restart playback
    if (state.isPlaying) {
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

      const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
      const startAt = Tone.now() + RESTART_DELAY;
      
      transport.start(startAt);
      samplerManager.startPart(startAt, this.pausedTime);

      if (wavPlayerManager.isAudioActive()) {
        wavPlayerManager.startActiveAudioAt(loopStart, startAt);
      }

      transportSyncManager.startSyncScheduler();
    } else {
      state.isPlaying = false;
    }

    setTimeout(() => {
      operationState.isRestarting = false;
    }, 100);
  }

  /**
   * Seek to specific time position
   */
  seek(seconds: number, updateVisual: boolean = true): void {
    const { state, operationState, samplerManager, wavPlayerManager, transportSyncManager, loopManager, pianoRoll } = this.deps;

    // Update timestamp for guard
    transportSyncManager.updateSeekTimestamp();

    // Clear pending seeks
    operationState.pendingSeek = null;
    operationState.isSeeking = true;

    // Read transport state
    const wasPlaying = Tone.getTransport().state === "started";
    state.isPlaying = wasPlaying;

    // Clamp and convert time
    const clampedVisual = clamp(seconds, 0, state.duration);
    const transportSeconds = transportSyncManager.visualToTransportTime(clampedVisual);

    // Update state immediately for responsiveness
    state.currentTime = clampedVisual;
    this.pausedTime = transportSeconds;

    // Update visual immediately to reduce perceived lag (centralized path)
    if (updateVisual) {
      if (this.deps.uiSync) this.deps.uiSync(clampedVisual, true);
      else pianoRoll.setTime(clampedVisual);
    }

    if (wasPlaying) {
      // Stop sync first but don't wait
      transportSyncManager.stopSyncScheduler();
      
      // Batch all stop operations
      samplerManager.stopPart();
      wavPlayerManager.stopAllAudioPlayers();

      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel();
      transport.seconds = transportSeconds;

      // Re-setup Part
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

      // Start transport and part (use loop-relative offset for Part)
      const startAt2 = Tone.now() + AUDIO_CONSTANTS.LOOKAHEAD_TIME;
      transport.start(startAt2);
      const relVisual = loopManager.getPartOffset(clampedVisual, transportSeconds);
      const relTransport = transportSyncManager.visualToTransportTime(relVisual);
      samplerManager.startPart(startAt2, relTransport);

      // Restart Sync
      state.isPlaying = true;
      transportSyncManager.startSyncScheduler();

      // Start external audio
      if (wavPlayerManager.isAudioActive()) {
        wavPlayerManager.stopAllAudioPlayers();
        wavPlayerManager.startActiveAudioAt(clampedVisual, "+0.01");
      }
    } else {
      Tone.getTransport().seconds = transportSeconds;
    }

    // Clear seeking flag
    setTimeout(() => {
      operationState.isSeeking = false;
    }, 50);
  }

  /**
   * Enable or disable repeat mode
   */
  toggleRepeat(enabled: boolean): void {
    const { state, loopManager, transportSyncManager, samplerManager, wavPlayerManager } = this.deps;
    
    state.isRepeating = enabled;
    this.deps.options.repeat = enabled;
    
    // Check if we're at the end and enabling loop
    const isAtEnd = state.currentTime >= state.duration - 0.01;
    const transportState = Tone.getTransport().state;
    const transportIsPlaying = transportState === "started";
    
    // Configure transport loop (this may trigger loop event if transport is running)
    loopManager.configureTransportLoop(
      enabled,
      state,
      state.duration
    );
    
    // Only manually restart if:
    // 1. We're enabling loop
    // 2. We're at the end
    // 3. Transport is NOT already playing (to avoid duplicate start)
    if (enabled && isAtEnd && !transportIsPlaying) {
      // Reset position to start
      this.pausedTime = 0;
      state.currentTime = 0;
      this.deps.pianoRoll.setTime(0);
      
      // Clear any previous Part
      samplerManager.stopPart();
      
      // Don't call play() here - let the user press play or space bar
      // This avoids the duplicate Part issue
      state.isPlaying = false;
    }
  }

  /**
   * Handle playback end (called by transport sync)
   */
  handlePlaybackEnd(): void {
    const { state, onPlaybackEnd } = this.deps;
    
    if (!state.isRepeating) {
      this.pause();
      state.currentTime = state.duration;
      this.deps.pianoRoll.setTime(state.duration);
      
      if (onPlaybackEnd) {
        onPlaybackEnd();
      }
    }
  }

  /**
   * Get/set paused time
   */
  getPausedTime(): number {
    return this.pausedTime;
  }

  setPausedTime(time: number): void {
    this.pausedTime = time;
  }
}
