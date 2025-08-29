/**
 * Synchronized Audio Player for Piano Roll Visualization (Refactored)
 *
 * Provides audio playback controls that synchronize with PixiJS piano roll visualizer.
 * Uses Tone.js for precise timing and scheduling, ensuring ≤16ms drift between
 * audio playback and visual playhead position.
 */

import * as Tone from "tone";
import { NoteData } from "@/lib/midi/types";
import { clamp } from "../utils";
import {
  PianoRollSync,
  PlayerOptions,
  AudioPlayerState,
  AudioPlayerContainer,
  OperationState,
  AUDIO_CONSTANTS,
} from "./player-types";

// Re-export types for external use
export type {
  PianoRollSync,
  PlayerOptions,
  AudioPlayerState,
  AudioPlayerContainer,
  OperationState,
} from "./player-types";
import { SamplerManager } from "./managers/sampler-manager";
import { WavPlayerManager } from "./managers/wav-player-manager";
import { TransportSyncManager } from "./managers/transport-sync-manager";
import { LoopManager } from "./managers/loop-manager";

/**
 * Internal audio player implementation
 */
export class AudioPlayer implements AudioPlayerContainer {
  private notes: NoteData[];
  private pianoRoll: PianoRollSync;
  public options: Required<Omit<PlayerOptions, 'onPlaybackEnd'>> & Pick<PlayerOptions, 'onPlaybackEnd'>;
  private midiManager: any;

  // Manager instances
  private samplerManager: SamplerManager;
  private wavPlayerManager: WavPlayerManager;
  private transportSyncManager: TransportSyncManager;
  private loopManager: LoopManager;

  // Player state
  private state: AudioPlayerState;
  private originalTempo: number;
  private isInitialized = false;
  private pausedTime = 0;
  /** Whether we paused automatically because all sources became silent */
  private _autoPausedBySilence = false;
  /** Until when we should ignore auto-pause checks after an auto-resume (ms timestamp) */
  private _silencePauseGuardUntilMs = 0;

  // Refactored operation state management
  private operationState: OperationState = {
    isSeeking: false,
    isRestarting: false,
    pendingSeek: null,
    lastLoopJumpTime: 0,
  };

  /** Prevent concurrent play() invocations */
  private _playLock = false;

  // Transport event handlers
  private handleTransportStop = (): void => {
    const handled = this.transportSyncManager.handleTransportStop(
      this.pausedTime
    );
    if (handled) {
      this.pausedTime = Tone.getTransport().seconds;
      // Stop external audio players if active
      this.wavPlayerManager.stopAllAudioPlayers();
    }
  };

  private handleTransportPause = (): void => {
    this.transportSyncManager.handleTransportPause(this.pausedTime);
    this.pausedTime = Tone.getTransport().seconds;
    // Stop any external audio player
    this.wavPlayerManager.stopAllAudioPlayers();
  };

  private handleTransportLoop = (): void => {
    const visualStart = this.loopManager.handleLoopEvent();
    this.transportSyncManager.handleTransportLoop(
      this.loopManager.loopStartVisual,
      this.loopManager.loopEndVisual
    );

    // Use immediate timing to ensure clean transition
    this.samplerManager.stopPart();

    // Restart the Part immediately at the beginning of its window
    this.samplerManager.startPart("+0", 0);

    // Restart external audio at A
    if (this.wavPlayerManager.isAudioActive()) {
      this.wavPlayerManager.startActiveAudioAt(visualStart);
    }
  };

  constructor(
    notes: NoteData[],
    pianoRoll: PianoRollSync,
    options: PlayerOptions = {}
  ) {
    this.notes = notes;
    this.pianoRoll = pianoRoll;

    // Set default options
    this.options = {
      tempo: AUDIO_CONSTANTS.DEFAULT_TEMPO,
      volume: AUDIO_CONSTANTS.DEFAULT_VOLUME,
      repeat: false,
      soundFont: "",
      syncInterval: AUDIO_CONSTANTS.DEFAULT_SYNC_INTERVAL,
      ...options,
    };

    // Calculate duration from notes
    const duration =
      notes.length > 0
        ? Math.max(...notes.map((note) => note.time + note.duration))
        : 0;

    // Initialize state with proper volume
    this.state = {
      isPlaying: false,
      isRepeating: this.options.repeat,
      currentTime: 0,
      duration,
      volume: this.options.volume,
      tempo: this.options.tempo,
      originalTempo: this.options.tempo,
      pan: 0,
      playbackRate: AUDIO_CONSTANTS.DEFAULT_PLAYBACK_RATE,
    };

    // Store the original tempo
    this.originalTempo = this.options.tempo;

    // Initialize managers
    this.samplerManager = new SamplerManager(notes, this.midiManager);
    this.wavPlayerManager = new WavPlayerManager();
    this.transportSyncManager = new TransportSyncManager(
      pianoRoll,
      this.state,
      this.operationState,
      {
        syncInterval: this.options.syncInterval,
        originalTempo: this.originalTempo,
      }
    );
    this.loopManager = new LoopManager(this.originalTempo);
    
    // Set callback for when playback reaches the end
    this.transportSyncManager.setEndCallback(() => {
      this.handlePlaybackEnd();
    });
  }

  /**
   * Initialize audio resources
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Start Tone.js audio context if needed
    if (Tone.context.state === "suspended") {
      await Tone.start();
    }

    // Set up Transport
    const transport = Tone.getTransport();
    transport.bpm.value = this.options.tempo;
    transport.loop = this.options.repeat;
    transport.loopStart = 0;
    transport.loopEnd = this.state.duration;

    // Initialize samplers
    await this.samplerManager.initialize({
      soundFont: this.options.soundFont,
      volume: this.options.volume,
    });

    // Setup external audio players
    this.wavPlayerManager.setupAudioPlayersFromRegistry({
      volume: this.state.volume,
      playbackRate: this.state.playbackRate,
    });

    // Update duration if audio provides longer timeline
    const maxAudioDur = this.wavPlayerManager.getMaxAudioDuration();
    if (maxAudioDur > this.state.duration) {
      this.state.duration = maxAudioDur;
    }

    // Create note part
    this.samplerManager.setupNotePart(
      this.loopManager.loopStartVisual,
      this.loopManager.loopEndVisual,
      {
        repeat: this.options.repeat,
        duration: this.state.duration,
        tempo: this.state.tempo,
        originalTempo: this.originalTempo,
      }
    );

    // Setup transport event callbacks
    this.setupTransportCallbacks();

    this.isInitialized = true;
  }

  /**
   * Set up transport event callbacks
   */
  private setupTransportCallbacks(): void {
    // Remove existing listeners first to prevent duplicates
    this.removeTransportCallbacks();

    // Add event listeners
    Tone.getTransport().on("stop", this.handleTransportStop);
    Tone.getTransport().on("pause", this.handleTransportPause);
    Tone.getTransport().on("loop", this.handleTransportLoop);
  }

  /**
   * Remove transport event callbacks
   */
  private removeTransportCallbacks(): void {
    Tone.getTransport().off("stop", this.handleTransportStop);
    Tone.getTransport().off("pause", this.handleTransportPause);
    Tone.getTransport().off("loop", this.handleTransportLoop);
  }

  /**
   * Start or resume playback
   */
  public async play(): Promise<void> {
    // Prevent concurrent play() calls
    if (this._playLock) {
      console.warn("[AudioPlayer.play] Ignored - already in progress");
      return;
    }
    this._playLock = true;

    try {
      // Ensure audio context is started
      if (Tone.context.state === "suspended") {
        console.log("Starting audio context...");
        await Tone.start();
        console.log("Audio context started:", Tone.context.state);
      }

      // Initialize if needed
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Already playing - nothing to do
      if (this.state.isPlaying) {
        return;
      }

      // Ensure external audio registry is considered on play
      this.wavPlayerManager.setupAudioPlayersFromRegistry({
        volume: this.state.volume,
        playbackRate: this.state.playbackRate,
      });

      // Wait for audio resources to load
      try {
        await Tone.loaded();
      } catch (error) {
        console.debug("Some audio resources may not have loaded:", error);
      }

      // Calculate resume position
      if (this.pausedTime > 0) {
        // Normal resume from pause
        Tone.getTransport().seconds = this.pausedTime;

        // Start MIDI part
        // Rebuild Part to avoid stale schedules after mutes/pauses
        this.samplerManager.setupNotePart(
          this.loopManager.loopStartVisual,
          this.loopManager.loopEndVisual,
          {
            repeat: this.options.repeat,
            duration: this.state.duration,
          }
        );
        // Part events are in seconds; use transport offset
        const offsetForPart = this.pausedTime;
        console.log("[AP.play] resume-from-pause", {
          pausedTime: this.pausedTime,
          currentTime: this.state.currentTime,
          offsetForPart,
          tempo: this.state.tempo,
          transportBPM: Tone.getTransport().bpm.value,
        });
        this.samplerManager.startPart("+0.01", offsetForPart);

        // Start WAV audio
        const resumeVisual =
          (this.pausedTime * this.state.tempo) / this.originalTempo;
        console.log("[AP.play] WAV resume", { resumeVisual });
        this.wavPlayerManager.startActiveAudioAt(resumeVisual, "+0.01");
      } else {
        // Start from beginning (or from A if loop is set)
        const resumeVisual =
          this.state.currentTime > 0 ? this.state.currentTime : 0;
        const resumeTransport =
          (resumeVisual * this.originalTempo) / this.state.tempo;

        Tone.getTransport().seconds = resumeTransport;
        this.pausedTime = resumeTransport;

        // Update piano roll
        this.pianoRoll.setTime(resumeVisual);

        // Start MIDI part
        // Rebuild Part fresh to ensure a clean start
        this.samplerManager.setupNotePart(
          this.loopManager.loopStartVisual,
          this.loopManager.loopEndVisual,
          {
            repeat: this.options.repeat,
            duration: this.state.duration,
          }
        );
        // Part events are in seconds; use transport offset
        const offsetForPart = resumeTransport;
        console.log("[AP.play] start-from", {
          resumeVisual,
          resumeTransport,
          offsetForPart,
          tempo: this.state.tempo,
          transportBPM: Tone.getTransport().bpm.value,
        });
        this.samplerManager.startPart("+0.01", offsetForPart);

        // Start WAV audio
        console.log("[AP.play] WAV start", { resumeVisual });
        this.wavPlayerManager.startActiveAudioAt(resumeVisual, "+0.01");
      }

      // Start the Transport
      console.log("[AP.play] Transport.start", {
        transportSec: Tone.getTransport().seconds,
        stateTempo: this.state.tempo,
      });
      Tone.getTransport().start("+0.01");

      this.state.isPlaying = true;
      // Clear auto-pause flag on successful start
      this._autoPausedBySilence = false;
      this.transportSyncManager.startSyncScheduler();
    } catch (error) {
      console.error("Failed to start playback:", error);
      throw new Error(
        `Playback failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      this._playLock = false;
    }
  }

  /**
   * Pause playback
   */
  public pause(): void {
    const transport = Tone.getTransport();
    if (transport.state === "stopped") {
      return;
    }

    transport.pause();
    this.state.isPlaying = false;
    this.pausedTime = transport.seconds;

    // Stop synchronization
    this.transportSyncManager.stopSyncScheduler();

    // Update piano roll
    this.pianoRoll.setTime(this.state.currentTime);

    // Stop external audio
    this.wavPlayerManager.stopAllAudioPlayers();
  }

  /**
   * Stop and restart from beginning
   */
  public restart(): void {
    const wasPlaying = this.state.isPlaying;

    // Prevent concurrent restarts
    if (this.operationState.isRestarting) return;
    this.operationState.isRestarting = true;

    // Stop synchronization
    this.transportSyncManager.stopSyncScheduler();

    // Stop and clear existing notes
    this.samplerManager.stopPart();

    // Clear Transport
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();

    // Determine restart position
    const visualStart = this.loopManager.loopStartVisual ?? 0;
    const transportStart =
      (visualStart * this.originalTempo) / this.state.tempo;

    // Reset transport
    transport.seconds = transportStart;
    transport.position = transportStart;

    // Reset internal states
    this.state.currentTime = visualStart;
    this.pausedTime = transportStart;

    if (!wasPlaying) {
      this.pianoRoll.setTime(visualStart);
    }

    if (wasPlaying) {
      // Rebuild part for loop window
      this.samplerManager.setupNotePart(
        this.loopManager.loopStartVisual,
        this.loopManager.loopEndVisual,
        {
          repeat: this.options.repeat,
          duration: this.state.duration,
          tempo: this.state.tempo,
          originalTempo: this.originalTempo,
        }
      );

      // Start transport
      const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
      const startTime = Tone.now() + RESTART_DELAY;

      transport.start(startTime);
      this.samplerManager.startPart(startTime, 0);

      this.state.isPlaying = true;
      this.transportSyncManager.startSyncScheduler();

      // Update visual
      this.transportSyncManager.scheduleVisualUpdate(() =>
        this.pianoRoll.setTime(visualStart)
      );

      // Start external audio
      if (this.wavPlayerManager.isAudioActive()) {
        this.wavPlayerManager.startActiveAudioAt(visualStart);
      }
    } else {
      // Rebuild part for next play
      this.samplerManager.setupNotePart(
        this.loopManager.loopStartVisual,
        this.loopManager.loopEndVisual,
        {
          repeat: this.options.repeat,
          duration: this.state.duration,
          tempo: this.state.tempo,
          originalTempo: this.originalTempo,
        }
      );
    }

    // Clear restarting flag
    setTimeout(() => {
      this.operationState.isRestarting = false;
    }, 100);
  }

  /**
   * Enable or disable repeat mode
   */
  public toggleRepeat(enabled: boolean): void {
    this.state.isRepeating = enabled;
    this.loopManager.configureTransportLoop(
      enabled,
      this.state,
      this.state.duration
    );
  }

  /**
   * Seek to specific time position
   */
  public seek(seconds: number, updateVisual: boolean = true): void {
    // Update timestamp for guard
    this.transportSyncManager.updateSeekTimestamp();

    // Clear pending seeks
    this.operationState.pendingSeek = null;
    this.operationState.isSeeking = true;

    // Read transport state
    const wasPlaying = Tone.getTransport().state === "started";
    this.state.isPlaying = wasPlaying;

    // Clamp and convert time
    const clampedVisual = clamp(seconds, 0, this.state.duration);
    const transportSeconds =
      this.transportSyncManager.visualToTransportTime(clampedVisual);

    console.log("[AP.seek] in", {
      seconds,
      clampedVisual,
      transportSeconds,
      wasPlaying,
    });

    // Update state
    this.state.currentTime = clampedVisual;
    this.pausedTime = transportSeconds;

    if (wasPlaying) {
      this.transportSyncManager.stopSyncScheduler();
      this.samplerManager.stopPart();

      Tone.getTransport().stop();
      Tone.getTransport().cancel();
      Tone.getTransport().seconds = transportSeconds;

      // Re-setup Part
      this.samplerManager.setupNotePart(
        this.loopManager.loopStartVisual,
        this.loopManager.loopEndVisual,
        {
          repeat: this.options.repeat,
          duration: this.state.duration,
          tempo: this.state.tempo,
          originalTempo: this.originalTempo,
        }
      );

      // Start transport and part
      Tone.getTransport().start("+0.01");
      // Part events are now in transport seconds, so use transport offset
      const offsetForPart = transportSeconds;
      console.log("[AP.seek] start part", {
        clampedVisual,
        transportSeconds,
        offsetForPart,
        transportBPM: Tone.getTransport().bpm.value,
      });
      this.samplerManager.startPart("+0.01", offsetForPart);

      // Restart Sync
      this.state.isPlaying = true;
      this.transportSyncManager.startSyncScheduler();

      // Start external audio
      if (this.wavPlayerManager.isAudioActive()) {
        this.wavPlayerManager.stopAllAudioPlayers();
        console.log("[AP.seek] WAV start", { offset: clampedVisual });
        this.wavPlayerManager.startActiveAudioAt(clampedVisual, "+0.01");
      }
    } else {
      Tone.getTransport().seconds = transportSeconds;
    }

    // Update visual
    if (updateVisual) {
      this.pianoRoll.setTime(clampedVisual);
    }

    // Clear seeking flag
    setTimeout(() => {
      this.operationState.isSeeking = false;
    }, 50);
  }

  /**
   * Set playback volume
   */
  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    console.log("[AP.setVolume]", { volume, clamped });

    this.samplerManager.setVolume(clamped);
    this.wavPlayerManager.setVolume(clamped);

    this.state.volume = clamped;
    this.options.volume = clamped;

    // Auto-pause if everything became silent
    this.maybeAutoPauseIfSilent();
  }

  /**
   * Set playback tempo
   */
  public setTempo(bpm: number): void {
    const clampedTempo = clamp(
      bpm,
      AUDIO_CONSTANTS.MIN_TEMPO,
      AUDIO_CONSTANTS.MAX_TEMPO
    );
    const oldTempo = this.state.tempo;
    this.state.tempo = clampedTempo;
    // Keep playbackRate in sync with tempo relative to originalTempo
    const ratePct = (clampedTempo / this.originalTempo) * 100;
    this.state.playbackRate = ratePct;

    if (this.state.isPlaying) {
      // Restart-style tempo change to flush scheduled events and avoid overlap
      this.operationState.isSeeking = true;
      this.operationState.isRestarting = true;

      const currentVisualTime = this.state.currentTime;
      const newTransportSeconds =
        (currentVisualTime * this.originalTempo) / clampedTempo;

      // Rescale A-B loop window to preserve transport-anchored positions
      this.loopManager.rescaleLoopForTempoChange(
        oldTempo,
        clampedTempo,
        this.state.duration
      );

      // Stop sync and Part, then fully reset Transport
      this.transportSyncManager.stopSyncScheduler();
      this.samplerManager.stopPart();

      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel();
      transport.bpm.value = clampedTempo;

      // Configure loop window under new tempo
      this.loopManager.configureTransportLoop(
        this.state.isRepeating,
        this.state,
        this.state.duration
      );

      // Set transport to new position
      transport.seconds = newTransportSeconds;

      // Rebuild Part
      this.samplerManager.setupNotePart(
        this.loopManager.loopStartVisual,
        this.loopManager.loopEndVisual,
        {
          repeat: this.options.repeat,
          duration: this.state.duration,
          tempo: clampedTempo,
          originalTempo: this.originalTempo,
        }
      );

      // Schedule synchronized start for both Transport/Part and WAV
      const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
      const startAt = Tone.now() + RESTART_DELAY;
      transport.start(startAt);
      this.samplerManager.startPart(startAt, newTransportSeconds);

      // WAV speed + start
      try { this.wavPlayerManager.setPlaybackRate(ratePct); } catch {}
      try {
        this.wavPlayerManager.stopAllAudioPlayers();
        this.wavPlayerManager.startActiveAudioAt(currentVisualTime, startAt);
      } catch {}

      this.state.isPlaying = true;
      this.transportSyncManager.startSyncScheduler();

      // Clear restarting flag
      setTimeout(() => { this.operationState.isRestarting = false; }, 100);
    } else {
      Tone.getTransport().bpm.value = clampedTempo;

      if (this.pausedTime > 0) {
        const currentVisualTime =
          (this.pausedTime * oldTempo) / this.originalTempo;
        this.pausedTime =
          (currentVisualTime * this.originalTempo) / clampedTempo;
      }

      // Not playing: still ensure WAV speed matches new tempo so next start is aligned
      try {
        this.wavPlayerManager.setPlaybackRate(ratePct);
      } catch {}

      // Rescale A-B loop window while paused
      this.loopManager.rescaleLoopForTempoChange(
        oldTempo,
        clampedTempo,
        this.state.duration
      );

      // Also update loop window while paused
      this.loopManager.configureTransportLoop(
        this.state.isRepeating,
        this.state,
        this.state.duration
      );
    }
  }

  /**
   * Set playback rate as percentage
   */
  public setPlaybackRate(rate: number): void {
    const clampedRate = clamp(
      rate,
      AUDIO_CONSTANTS.MIN_PLAYBACK_RATE,
      AUDIO_CONSTANTS.MAX_PLAYBACK_RATE
    );
    const oldRate = this.state.playbackRate || 100;
    const prevTempo = this.state.tempo;

    if (clampedRate === oldRate) {
      return;
    }

    this.state.playbackRate = clampedRate;

    const speedMultiplier = clampedRate / 100;
    const newTempo = this.originalTempo * speedMultiplier;

    this.state.tempo = newTempo;
    // Rescale A-B loop window to preserve transport-anchored positions
    this.loopManager.rescaleLoopForTempoChange(
      prevTempo,
      newTempo,
      this.state.duration
    );

    // Update WAV playback rate
    this.wavPlayerManager.setPlaybackRate(clampedRate);

    // Update Transport BPM (ties visual tempo to playback rate)
    const wasPlaying = this.state.isPlaying;
    const transportTime = wasPlaying
      ? Tone.getTransport().seconds
      : this.pausedTime;

    Tone.getTransport().bpm.value = newTempo;

    if (!wasPlaying) {
      Tone.getTransport().seconds = transportTime;
    }

    // Rebuild Part to reflect new tempo mapping and keep scheduling consistent
    this.samplerManager.stopPart();
    this.samplerManager.setupNotePart(
      this.loopManager.loopStartVisual,
      this.loopManager.loopEndVisual,
      {
        repeat: this.options.repeat,
        duration: this.state.duration,
        tempo: this.state.tempo,
        originalTempo: this.originalTempo,
      }
    );
    if (wasPlaying) {
      this.samplerManager.startPart("+0.01", transportTime);
    }

    // Update visual
    const visualTime = this.transportSyncManager.transportToVisualTime(
      Tone.getTransport().seconds
    );
    this.state.currentTime = visualTime;
    this.pianoRoll.setTime(visualTime);

    // While playing, realign WAV at the current position after playback-rate change
    if (wasPlaying) {
      try {
        const RESTART_DELAY = AUDIO_CONSTANTS.RESTART_DELAY;
        const startAt = Tone.now() + RESTART_DELAY;
        this.wavPlayerManager.stopAllAudioPlayers();
        this.wavPlayerManager.startActiveAudioAt(visualTime, startAt);
      } catch {}
    }

    // Avoid double-start: stop/start already handled just above when playing
    
    // Update Transport loop window after playback-rate change
    this.loopManager.configureTransportLoop(
      this.state.isRepeating,
      this.state,
      this.state.duration
    );
  }

  /**
   * Set custom A-B loop points
   */
  public setLoopPoints(
    start: number | null,
    end: number | null,
    preservePosition: boolean = false
  ): void {
    const result = this.loopManager.setLoopPoints(
      start,
      end,
      this.state.duration,
      this.state
    );

    if (!result.changed) {
      return;
    }

    // Clear looping if start is null
    if (start === null) {
      this.toggleRepeat(false);
      this.samplerManager.setupNotePart(null, null, {
        repeat: this.options.repeat,
        duration: this.state.duration,
        tempo: this.state.tempo,
        originalTempo: this.originalTempo,
      });
      return;
    }

    // Setup looping
    this.state.isRepeating = true;

    const transport = Tone.getTransport();
    const wasPlaying = this.state.isPlaying;
    const currentPosition = this.state.currentTime;

    // Rebuild Part
    this.samplerManager.stopPart();
    this.samplerManager.setupNotePart(
      this.loopManager.loopStartVisual,
      this.loopManager.loopEndVisual,
      {
        repeat: this.options.repeat,
        duration: this.state.duration,
        tempo: this.state.tempo,
        originalTempo: this.originalTempo,
      }
    );

    // Configure Transport
    transport.loop = true;
    transport.loopStart = result.transportStart;
    transport.loopEnd = result.transportEnd;

    // Handle playback state
    if (wasPlaying) {
      transport.stop();
      transport.cancel();

      if (preservePosition && result.shouldPreservePosition) {
        const offsetInLoop = currentPosition - (start ?? 0);
        const transportPosition =
          result.transportStart +
          (offsetInLoop * this.originalTempo) / this.state.tempo;
        transport.seconds = transportPosition;

        transport.start("+0.01");
        this.samplerManager.startPart("+0.01", offsetInLoop);
      } else {
        transport.seconds = result.transportStart;
        this.state.currentTime = start ?? 0;
        this.pianoRoll.setTime(start ?? 0);

        transport.start("+0.01");
        this.samplerManager.startPart("+0.01", 0);
      }

      this.transportSyncManager.startSyncScheduler();

      // Handle external audio
      if (this.wavPlayerManager.isAudioActive()) {
        this.wavPlayerManager.stopAllAudioPlayers();
        const audioStartPos =
          preservePosition && result.shouldPreservePosition
            ? currentPosition
            : (start ?? 0);
        this.wavPlayerManager.startActiveAudioAt(audioStartPos);
      }
    } else {
      if (!preservePosition) {
        transport.seconds = result.transportStart;
        this.pausedTime = result.transportStart;
        this.state.currentTime = start ?? 0;
        this.pianoRoll.setTime(start ?? 0);
      }
    }
  }

  /**
   * Get current player state
   */
  public getState(): AudioPlayerState {
    return { ...this.state };
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.removeTransportCallbacks();

    const transport = Tone.getTransport();
    if (transport.state !== "stopped") {
      transport.stop();
    }
    transport.cancel();

    this.transportSyncManager.stopSyncScheduler();
    this.samplerManager.destroy();
    this.wavPlayerManager.destroy();
  }

  /**
   * Set stereo pan value
   */
  public setPan(pan: number): void {
    const clamped = Math.max(-1, Math.min(1, pan));
    this.samplerManager.setPan(clamped);
    this.wavPlayerManager.setPan(clamped);
    this.state.pan = clamped;
  }

  /**
   * Set stereo pan for a specific file
   */
  public setFilePan(fileId: string, pan: number): void {
    this.samplerManager.setFilePan(fileId, pan);
  }

  /**
   * Set mute state for a specific file
   */
  public setFileMute(fileId: string, mute: boolean): void {
    console.log("[AP.setFileMute]", {
      fileId,
      mute,
      isPlaying: this.state.isPlaying,
      master: this.state.volume,
      currentTime: this.state.currentTime,
    });
    this.samplerManager.setFileMute(fileId, mute);
    // Also check WAV players
    // Note: WAV muting is handled through volume in the manager
    this.maybeAutoPauseIfSilent();

    // If unmuting a MIDI track while transport is running, retrigger currently held notes
    if (!mute && this.state.isPlaying) {
      // If master volume is 0 (possibly due to a prior auto-mute), restore to default
      if (this.state.volume === 0) {
        const restore = this.options.volume > 0 ? this.options.volume : 0.7;
        this.setVolume(restore);
      }
      // If the track's per-file volume is effectively silent, lift to master volume
      try {
        this.samplerManager.ensureTrackAudible(fileId, this.state.volume);
      } catch {}
      try {
        this.samplerManager.retriggerHeldNotes(fileId, this.state.currentTime);
      } catch {}

      // Reschedule the Part at the current position so upcoming onsets are guaranteed
      // Note: Don't use seek() as it causes WAV to restart incorrectly
      // Instead, directly reschedule the Part
      try {
        const currentVisual = this.state.currentTime;
        const transportSeconds = this.transportSyncManager.visualToTransportTime(currentVisual);
        
        // Stop and restart Part to ensure upcoming notes are scheduled
        this.samplerManager.stopPart();
        this.samplerManager.setupNotePart(
          this.loopManager.loopStartVisual,
          this.loopManager.loopEndVisual,
          {
            repeat: this.options.repeat,
            duration: this.state.duration,
            tempo: this.state.tempo,
            originalTempo: this.originalTempo,
          }
        );
        // Part events are now in transport seconds, so use transport offset
        const offsetForPart = transportSeconds;
        this.samplerManager.startPart("+0", offsetForPart);
      } catch {}
    }

    // If we previously auto-paused due to silence, resume on first unmute
    if (!mute && !this.state.isPlaying && this._autoPausedBySilence) {
      // Best-effort resume; ignore errors
      this.play()
        .then(() => {
          // Restore master volume if it was at 0
          if (this.state.volume === 0) {
            const restore = this.options.volume > 0 ? this.options.volume : 0.7;
            this.setVolume(restore);
          }
          // Ensure per-file sampler is not stuck at silent dB
          try {
            this.samplerManager.ensureTrackAudible(fileId, this.state.volume);
          } catch {}
          // After resuming, retrigger any held notes for this track so long sustains become audible
          try {
            setTimeout(() => {
              this.samplerManager.retriggerHeldNotes(
                fileId,
                this.state.currentTime
              );
            }, 30);
          } catch {}
          console.log("[AP.setFileMute] auto-resumed after unmute", {
            fileId,
            currentTime: this.state.currentTime,
            master: this.state.volume,
          });
        })
        .catch(() => {});
      // Short grace period to avoid immediate re-pause due to racey silence checks
      this._silencePauseGuardUntilMs = Date.now() + 500;
      this._autoPausedBySilence = false;
    }
  }

  /**
   * Set volume for a specific MIDI file
   */
  public setFileVolume(fileId: string, volume: number): void {
    this.samplerManager.setFileVolume(fileId, volume, this.state.volume);
    this.maybeAutoPauseIfSilent();
  }

  /**
   * Set volume for a specific WAV file
   */
  public setWavVolume(fileId: string, volume: number): void {
    console.log("[AP.setWavVolume]", {
      fileId,
      volume,
      master: this.state.volume,
      isPlaying: this.state.isPlaying,
      currentTime: this.state.currentTime,
    });
    // If unmuting a WAV while master volume is 0, restore to default first
    if (volume > 0 && this.state.volume === 0) {
      const restore = this.options.volume > 0 ? this.options.volume : 0.7;
      this.setVolume(restore);
    }

    this.wavPlayerManager.setWavVolume(fileId, volume, this.state.volume, {
      isPlaying: this.state.isPlaying,
      currentTime: this.state.currentTime,
    });
    // Auto-resume playback on WAV unmute (Requirement A)
    if (volume > 0 && !this.state.isPlaying) {
      this._silencePauseGuardUntilMs = Date.now() + 500;
      this.play().catch(() => {});
    }
    this.maybeAutoPauseIfSilent();
  }

  /**
   * Refresh WAV/audio players from registry
   */
  public refreshAudioPlayers(): void {
    this.wavPlayerManager.refreshAudioPlayers({
      isPlaying: this.state.isPlaying,
      currentTime: this.state.currentTime,
      volume: this.state.volume,
      playbackRate: this.state.playbackRate,
    });
    this.maybeAutoPauseIfSilent();
  }

  /**
   * Handle playback reaching the end of duration
   */
  private handlePlaybackEnd(): void {
    if (!this.state.isRepeating && this.state.isPlaying) {
      console.log("[AP] Playback reached end, stopping and resetting");
      
      // First pause the playback
      this.pause();
      
      // Reset to the beginning for next play
      this.seek(0);
      
      // Emit event for UI to update play button state if needed
      if (this.options.onPlaybackEnd) {
        this.options.onPlaybackEnd();
      }
    }
  }
  
  /**
   * Check if all sources are silent and auto-pause if needed
   */
  private maybeAutoPauseIfSilent(): void {
    if (!this.state.isPlaying) {
      return;
    }

    // Grace period after auto-resume: avoid re-pausing due to transient race
    if (Date.now() < this._silencePauseGuardUntilMs) {
      console.log("[AP.autoPause] guard active", {
        now: Date.now(),
        until: this._silencePauseGuardUntilMs,
      });
      return;
    }

    // Check master volume
    if (this.state.volume === 0) {
      this.pause();
      return;
    }

    // Check if all sources are muted
    const midiMuted = this.samplerManager.areAllTracksMuted();
    const wavMuted = this.wavPlayerManager.areAllPlayersMuted();

    if (midiMuted && wavMuted) {
      console.log("[AP.autoPause] all silent -> pause", {
        master: this.state.volume,
        midiMuted,
        wavMuted,
      });
      // Mark as auto-paused so we can resume when any track becomes audible again
      this._autoPausedBySilence = true;
      this.pause();
    }
  }
}

/**
 * Create a new audio player instance
 */
export function createAudioPlayer(
  notes: NoteData[],
  pianoRoll: PianoRollSync,
  options?: PlayerOptions
): AudioPlayer {
  return new AudioPlayer(notes, pianoRoll, options);
}
