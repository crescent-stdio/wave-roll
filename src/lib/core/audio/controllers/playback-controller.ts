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
      // console.log("[PlaybackController.play] Already in play(), ignoring");
      return;
    }
    this._playLock = true;

    try {
      const { state, samplerManager, wavPlayerManager, transportSyncManager, loopManager } = this.deps;

      // === GHOST AUDIO PREVENTION ===
      // Increment generation token to prevent ghost audio
      state.playbackGeneration = (state.playbackGeneration || 0) + 1;
      const currentGeneration = state.playbackGeneration;
      
      // console.log("[PlaybackController.play] Starting playback with generation", currentGeneration);

      // Ensure WavPlayerManager has reference to TransportSyncManager
      wavPlayerManager.setTransportSyncManager(transportSyncManager);

      if (state.isPlaying) {
        // console.log("[PlaybackController.play] Already playing");
        return;
      }

      // Ensure Tone.js context is started
      if (Tone.context.state === "suspended") {
        await Tone.start();
        // console.log("[PlaybackController] Audio context started");
      }

      // Handle play-after-end: rewind to start (0) and start playback
      // Also handle case where we're at the end and repeating is on
      if (state.currentTime >= state.duration - 0.001) {
        this.pausedTime = 0;
        state.currentTime = 0;
        state.nowTime = 0; // Update unified time reference
        // Update visual immediately
        this.deps.pianoRoll.setTime(0);
      }

      // Update unified time reference
      state.nowTime = state.currentTime;

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

      // Compute offsets ONCE using the same logic for both MIDI and WAV
      const visualAtStart = transportSyncManager.transportToVisualTime(this.pausedTime);
      const relativeVisualOffset = loopManager.getPartOffset(visualAtStart, this.pausedTime);
      const relativeTransportOffset = transportSyncManager.visualToTransportTime(relativeVisualOffset);

      // console.log("[PlaybackController] Calculated offsets:", {
      //   pausedTime: this.pausedTime,
      //   visualAtStart,
      //   relativeVisualOffset,
      //   relativeTransportOffset,
      //   generation: currentGeneration
      // });

      // Use a single unified start time for perfect synchronization
      const startAt = Tone.now() + AUDIO_CONSTANTS.LOOKAHEAD_TIME;
      
      // console.log("[PlaybackController] Starting synchronized playback at", startAt, "generation", currentGeneration);
      
      // Check generation before each critical operation
      if (state.playbackGeneration !== currentGeneration) {
        // console.log("[PlaybackController.play] Generation changed during setup, aborting");
        return;
      }
      
      // Unmute sampler track gates just-in-time
      try { this.deps.samplerManager.hardUnmuteAllGates(); } catch {}

      // Start transport
      transport.start(startAt);
      
      // Start MIDI part with computed offset
      if (state.playbackGeneration !== currentGeneration) {
        // console.log("[PlaybackController.play] Generation changed before MIDI start, aborting");
        return;
      }
      
      samplerManager.startPart(startAt, relativeTransportOffset);

      // Start WAV audio with SAME relative visual offset (unified calculation)
      // Use Tone.js Transport scheduling for perfect sync
      if (wavPlayerManager.isAudioActive()) {
        if (state.playbackGeneration !== currentGeneration) {
          // console.log("[PlaybackController.play] Generation changed before WAV start, aborting");
          return;
        }
        
        // console.log("[PlaybackController] Starting WAV immediately with unified offset");
        wavPlayerManager.startActiveAudioAtSync(relativeVisualOffset, startAt);
      }

      // Final generation check before updating state
      if (state.playbackGeneration !== currentGeneration) {
        // console.log("[PlaybackController.play] Generation changed before state update, aborting");
        return;
      }

      state.isPlaying = true;
      transportSyncManager.startSyncScheduler();
      
      // console.log("[PlaybackController.play] Successfully started generation", currentGeneration);
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
      // console.log("[PlaybackController.pause] Not playing");
      return;
    }

    // Stop sync first
    transportSyncManager.stopSyncScheduler();

    // Hard mute gates to ensure immediate silence
    try { samplerManager.hardMuteAllGates(); } catch {}

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
    try { samplerManager.stopAllVoicesImmediate(); } catch {}
    try { samplerManager.hardMuteAllGates(); } catch {}
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
      
      try { samplerManager.hardUnmuteAllGates(); } catch {}
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

    // === GHOST AUDIO PREVENTION ===
    // Increment generation token to invalidate any pending operations
    state.playbackGeneration = (state.playbackGeneration || 0) + 1;
    const currentGeneration = state.playbackGeneration;
    
    // console.log("[PlaybackController.seek] Starting with generation", currentGeneration);

    // Update timestamp for guard
    transportSyncManager.updateSeekTimestamp();

    // Clear pending seeks
    operationState.pendingSeek = null;
    operationState.isSeeking = true;

    // Use high-level engine state rather than Transport state.
    // Users may trigger a second seek during the short window where we stop
    // and reschedule Transport; relying on Transport.state would incorrectly
    // treat the player as paused and skip the restart. The engine-level
    // state.isPlaying faithfully represents the intended mode.
    const wasPlaying = state.isPlaying;
    // console.log("[PlaybackController.seek] request", {
    //   seconds,
    //   wasPlaying,
    //   midiDuration: state.duration,
    //   generation: currentGeneration,
    // });

    // Clamp and convert time against max(MIDI, WAV) so WAV tails are seekable
    let maxWav = 0;
    try {
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ audioBuffer?: AudioBuffer }> } })._waveRollAudio;
      const items = api?.getFiles?.() || [];
      const ds = items.map((i) => i.audioBuffer?.duration || 0).filter((d) => d > 0);
      maxWav = ds.length > 0 ? Math.max(...ds) : 0;
    } catch {}
    const maxVisual = Math.max(state.duration, maxWav);
    const requestedVisual = clamp(seconds, 0, maxVisual);
    const transportSeconds = transportSyncManager.visualToTransportTime(requestedVisual);
    // console.log("[PlaybackController.seek] computed", {
    //   maxWav,
    //   maxVisual,
    //   requestedVisual,
    //   transportSeconds,
    //   generation: currentGeneration,
    // });

    // Update state immediately for responsiveness
    state.currentTime = requestedVisual; // keep UI aligned with requested time
    state.nowTime = requestedVisual; // Update unified time reference
    this.pausedTime = transportSeconds;

    // Update visual immediately to reduce perceived lag (centralized path)
    if (updateVisual) {
      if (this.deps.uiSync) this.deps.uiSync(requestedVisual, true);
      else pianoRoll.setTime(requestedVisual);
      // console.log("[PlaybackController.seek] UI sync", { requestedVisual, generation: currentGeneration });
    }

    if (wasPlaying) {
      // === ATOMIC STOP PHASE ===
      // console.log("[PlaybackController.seek] Stopping all audio atomically for generation", currentGeneration);
      
      // Stop sync first but don't wait
      transportSyncManager.stopSyncScheduler();
      
      // Batch all stop operations with generation awareness
      samplerManager.stopPart();
      
      // Ensure all currently sounding voices are immediately silenced to avoid bleed
      try { samplerManager.stopAllVoicesImmediate(); } catch {}
      // Hard mute gates to kill any residuals in the chain
      try { samplerManager.hardMuteAllGates(); } catch {}
      
      // Stop WAV players with Transport cleanup
      wavPlayerManager.stopAllAudioPlayers();

      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel();
      transport.seconds = transportSeconds;
      // console.log("[PlaybackController.seek] transport positioned", { transportSeconds, generation: currentGeneration });

      // === ATOMIC UPDATE PHASE ===
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
      // console.log("[PlaybackController.seek] part setup", {
      //   loopStartVisual: loopManager.loopStartVisual,
      //   loopEndVisual: loopManager.loopEndVisual,
      //   generation: currentGeneration,
      // });

      // === GENERATION-AWARE START PHASE ===
      // Start transport and part (use loop-relative offset for Part)
      const hasUnloadedWav2 = wavPlayerManager.hasActiveUnloadedPlayers?.() === true;
      const extra2 = hasUnloadedWav2 ? 0.35 : AUDIO_CONSTANTS.LOOKAHEAD_TIME;
      const startAt2 = Tone.now() + extra2;
      
      // Check generation before each start operation
      if (state.playbackGeneration !== currentGeneration) {
        // console.log("[PlaybackController.seek] Generation changed during seek, aborting", {
        //   expected: currentGeneration,
        //   actual: state.playbackGeneration
        // });
        operationState.isSeeking = false;
        return;
      }
      
      // Unmute gates just-in-time before starting
      try { samplerManager.hardUnmuteAllGates(); } catch {}
      transport.start(startAt2);
      
      // Ensure MIDI Part offset stays within MIDI duration to avoid silent starts
      const midiDur = Math.max(0, state.duration || 0);
      const safeVisualForPart = midiDur > 0
        ? Math.min(requestedVisual, Math.max(0, midiDur - 0.001))
        : 0;
      const relVisual = loopManager.getPartOffset(safeVisualForPart, transportSeconds);
      const relTransport = transportSyncManager.visualToTransportTime(relVisual);
      
      // Final generation check before starting MIDI
      if (state.playbackGeneration !== currentGeneration) {
        // console.log("[PlaybackController.seek] Generation changed before MIDI start, aborting");
        operationState.isSeeking = false;
        return;
      }
      
      samplerManager.startPart(startAt2, relTransport);
      // console.log("[PlaybackController.seek] start", {
      //   startAt: startAt2,
      //   safeVisualForPart,
      //   relVisual,
      //   relTransport,
      //   generation: currentGeneration,
      // });

      // Restart Sync
      state.isPlaying = true;
      transportSyncManager.startSyncScheduler();

      // Start external audio at the same absolute time as Transport/Part
      if (wavPlayerManager.isAudioActive()) {
        // Final generation check before starting WAV
        if (state.playbackGeneration !== currentGeneration) {
          // console.log("[PlaybackController.seek] Generation changed before WAV start, aborting");
          operationState.isSeeking = false;
          return;
        }
        
        wavPlayerManager.stopAllAudioPlayers();
        wavPlayerManager.startActiveAudioAtSync(requestedVisual, startAt2);
        // console.log("[PlaybackController.seek] wav restart", { requestedVisual, startAt: startAt2, generation: currentGeneration });
      }

      // Retrigger held notes for all unmuted tracks at the seek position
      // This ensures long-duration notes that started before the seek position are audible
      samplerManager.retriggerAllUnmutedHeldNotes(requestedVisual);
      // console.log("[PlaybackController.seek] retriggered held notes", { requestedVisual, generation: currentGeneration });
      
    } else {
      Tone.getTransport().seconds = transportSeconds;
      // console.log("[PlaybackController.seek] paused seek", { transportSeconds, generation: currentGeneration });
    }

    // Clear seeking flag
    setTimeout(() => {
      operationState.isSeeking = false;
      // console.log("[PlaybackController.seek] Completed generation", currentGeneration);
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
