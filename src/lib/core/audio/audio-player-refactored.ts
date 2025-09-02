/**
 * Synchronized Audio Player for Piano Roll Visualization (Refactored)
 *
 * Provides audio playback controls that synchronize with PixiJS piano roll visualizer.
 * Uses Tone.js for precise timing and scheduling, ensuring ≤16ms drift between
 * audio playback and visual playhead position.
 */

import * as Tone from "tone";
import { NoteData } from "@/lib/midi/types";
import {
  PianoRollSync,
  PlayerOptions,
  AudioPlayerState,
  AudioPlayerContainer,
  OperationState,
  AUDIO_CONSTANTS,
} from "./player-types";

// Manager imports
import { SamplerManager } from "./managers/sampler-manager";
import { WavPlayerManager } from "./managers/wav-player-manager";
import { TransportSyncManager } from "./managers/transport-sync-manager";
import { LoopManager } from "./managers/loop-manager";

// Controller imports
import { PlaybackController } from "./controllers/playback-controller";
import { AudioSettingsController } from "./controllers/audio-settings-controller";
import { FileAudioController } from "./controllers/file-audio-controller";
import { AutoPauseController } from "./controllers/auto-pause-controller";

// Re-export types for external use
export type {
  PianoRollSync,
  PlayerOptions,
  AudioPlayerState,
  AudioPlayerContainer,
  OperationState,
} from "./player-types";

/**
 * Refactored audio player implementation using modular controllers
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

  // Controller instances
  private playbackController: PlaybackController;
  private audioSettingsController: AudioSettingsController;
  private fileAudioController: FileAudioController;
  private autoPauseController: AutoPauseController;

  // Player state
  private state: AudioPlayerState;
  private originalTempo: number;
  private isInitialized = false;

  // Refactored operation state management
  private operationState: OperationState = {
    isSeeking: false,
    isRestarting: false,
    pendingSeek: null,
    lastLoopJumpTime: 0,
  };

  // Transport event handlers
  private handleTransportStop = (): void => {
    const pausedTime = this.playbackController.getPausedTime();
    const handled = this.transportSyncManager.handleTransportStop(pausedTime);
    if (handled) {
      this.playbackController.setPausedTime(Tone.getTransport().seconds);
      this.wavPlayerManager.stopAllAudioPlayers();
    }
  };

  private handleTransportPause = (): void => {
    const pausedTime = this.playbackController.getPausedTime();
    this.transportSyncManager.handleTransportPause(pausedTime);
    this.playbackController.setPausedTime(Tone.getTransport().seconds);
    this.wavPlayerManager.stopAllAudioPlayers();
  };

  private handleTransportLoop = (): void => {
    const visualStart = this.loopManager.handleLoopEvent();
    this.transportSyncManager.handleTransportLoop(
      this.loopManager.loopStartVisual,
      this.loopManager.loopEndVisual
    );

    this.samplerManager.stopPart();

    const transport = Tone.getTransport();
    const transportStart = this.loopManager.loopStartTransport ?? 0;
    
    setTimeout(() => {
      this.samplerManager.startPart(Tone.now(), transportStart);
    }, 10);

    if (this.wavPlayerManager.isAudioActive() && visualStart !== null) {
      this.wavPlayerManager.restartAtPosition(visualStart);
    }

    this.operationState.lastLoopJumpTime = Date.now();
  };

  constructor(
    notes: NoteData[],
    pianoRoll: PianoRollSync,
    options?: PlayerOptions,
    midiManager?: any
  ) {
    // Initialize basic properties
    this.notes = notes;
    this.pianoRoll = pianoRoll;
    this.midiManager = midiManager;
    
    // Merge options with defaults
    this.options = {
      tempo: 120,
      volume: 0.7,
      repeat: false,
      syncInterval: 16,
      ...options,
    };

    // Calculate duration
    const duration = notes.length > 0
      ? Math.max(...notes.map(n => n.time + n.duration))
      : 0;

    // Initialize state
    this.originalTempo = this.options.tempo;
    this.state = {
      isPlaying: false,
      isRepeating: this.options.repeat ?? false,
      currentTime: 0,
      duration,
      volume: this.options.volume ?? 0.7,
      tempo: this.options.tempo ?? 120,
      originalTempo: this.originalTempo,
      pan: 0,
      playbackRate: 100,
    };

    // Initialize managers
    this.samplerManager = new SamplerManager(notes, midiManager);
    this.wavPlayerManager = new WavPlayerManager(midiManager);
    this.transportSyncManager = new TransportSyncManager(
      pianoRoll,
      this.state,
      this.operationState,
      this.originalTempo,
      () => this.handlePlaybackEnd()
    );
    this.loopManager = new LoopManager(this.originalTempo);

    // Initialize controllers with dependencies
    this.playbackController = new PlaybackController({
      state: this.state,
      operationState: this.operationState,
      samplerManager: this.samplerManager,
      wavPlayerManager: this.wavPlayerManager,
      transportSyncManager: this.transportSyncManager,
      loopManager: this.loopManager,
      originalTempo: this.originalTempo,
      options: this.options,
      pianoRoll: this.pianoRoll,
      onPlaybackEnd: this.options.onPlaybackEnd,
    });

    this.audioSettingsController = new AudioSettingsController({
      state: this.state,
      operationState: this.operationState,
      samplerManager: this.samplerManager,
      wavPlayerManager: this.wavPlayerManager,
      transportSyncManager: this.transportSyncManager,
      loopManager: this.loopManager,
      originalTempo: this.originalTempo,
      options: this.options,
      onVolumeChange: () => this.maybeAutoPauseIfSilent(),
    });

    this.fileAudioController = new FileAudioController({
      samplerManager: this.samplerManager,
      wavPlayerManager: this.wavPlayerManager,
      midiManager: this.midiManager,
      onFileSettingsChange: () => this.handleFileSettingsChange(),
    });

    this.autoPauseController = new AutoPauseController({
      state: this.state,
      checkAllMuted: () => this.fileAudioController.areAllFilesMuted(),
      checkAllZeroVolume: () => this.fileAudioController.areAllFilesZeroVolume(),
      onAutoPause: () => this.pause(),
      onAutoResume: () => this.play().catch(() => {}),
    });

    // Initialize audio system
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize Tone.js transport
      const transport = Tone.getTransport();
      transport.bpm.value = this.options.tempo ?? 120;
      transport.loop = false;

      // Initialize samplers
      await this.samplerManager.initialize({
        soundFont: this.options.soundFont,
        volume: this.options.volume,
      });

      // WAV players are initialized in constructor
      // No additional initialization needed

      // Setup transport callbacks
      this.setupTransportCallbacks();

      this.isInitialized = true;
      console.log("[AudioPlayer] Initialized successfully");
    } catch (error) {
      console.error("[AudioPlayer] Failed to initialize:", error);
      throw error;
    }
  }

  private setupTransportCallbacks(): void {
    const transport = Tone.getTransport();
    transport.off("stop", this.handleTransportStop);
    transport.off("pause", this.handleTransportPause);
    transport.off("loop", this.handleTransportLoop);
    
    transport.on("stop", this.handleTransportStop);
    transport.on("pause", this.handleTransportPause);
    transport.on("loop", this.handleTransportLoop);
  }

  private removeTransportCallbacks(): void {
    const transport = Tone.getTransport();
    transport.off("stop", this.handleTransportStop);
    transport.off("pause", this.handleTransportPause);
    transport.off("loop", this.handleTransportLoop);
  }

  // Public API - delegate to controllers

  public async play(): Promise<void> {
    await this.playbackController.play();
  }

  public pause(): void {
    this.playbackController.pause();
  }

  public restart(): void {
    this.playbackController.restart();
  }

  public toggleRepeat(enabled: boolean): void {
    this.playbackController.toggleRepeat(enabled);
  }

  public seek(seconds: number, updateVisual: boolean = true): void {
    this.playbackController.seek(seconds, updateVisual);
  }

  public setVolume(volume: number): void {
    this.audioSettingsController.setVolume(volume);
  }

  public setTempo(bpm: number): void {
    this.audioSettingsController.setTempo(bpm);
  }

  public setPlaybackRate(rate: number): void {
    this.audioSettingsController.setPlaybackRate(rate);
  }

  public setLoopPoints(
    start: number | null,
    end: number | null,
    preservePosition: boolean = false
  ): void {
    this.audioSettingsController.setLoopPoints(start, end, preservePosition);
  }

  public setPan(pan: number): void {
    this.audioSettingsController.setPan(pan);
  }

  public setFilePan(fileId: string, pan: number): void {
    this.fileAudioController.setFilePan(fileId, pan);
  }

  public setFileMute(fileId: string, mute: boolean): void {
    this.fileAudioController.setFileMute(fileId, mute);
    
    // Handle auto-resume logic
    if (!mute && !this.state.isPlaying && this.autoPauseController.isAutoPaused()) {
      this.autoPauseController.setAutoPaused(false);
      this.play()
        .then(() => {
          if (this.state.volume === 0) {
            const restore = this.options.volume > 0 ? this.options.volume : 0.7;
            this.setVolume(restore);
          }
          // Additional retrigger logic if needed
          this.samplerManager.ensureTrackAudible(fileId, this.state.volume);
          setTimeout(() => {
            this.samplerManager.retriggerHeldNotes(fileId, this.state.currentTime);
          }, 30);
        })
        .catch(() => {});
    }
    
    // Handle re-scheduling when unmuting while playing
    if (!mute && this.state.isPlaying) {
      if (this.state.volume === 0) {
        const restore = this.options.volume > 0 ? this.options.volume : 0.7;
        this.setVolume(restore);
      }
      
      try {
        this.samplerManager.ensureTrackAudible(fileId, this.state.volume);
        this.samplerManager.retriggerHeldNotes(fileId, this.state.currentTime);
        
        // Reschedule Part to ensure upcoming notes
        const currentVisual = this.state.currentTime;
        const transportSeconds = this.transportSyncManager.visualToTransportTime(currentVisual);
        
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
        this.samplerManager.startPart("+0", transportSeconds);
      } catch {}
    }
  }

  public setFileVolume(fileId: string, volume: number): void {
    this.fileAudioController.setFileVolume(fileId, volume);
    this.maybeAutoPauseIfSilent();
  }

  public setWavVolume(fileId: string, volume: number): void {
    // Handle auto-unmute logic
    if (volume > 0 && this.state.volume === 0) {
      const restore = this.options.volume > 0 ? this.options.volume : 0.7;
      this.setVolume(restore);
    }
    
    // Use the file audio controller method
    this.fileAudioController.setWavVolume(fileId, volume, this.state.volume, {
      isPlaying: this.state.isPlaying,
      currentTime: this.state.currentTime,
    });
    
    // Auto-resume on WAV unmute
    if (volume > 0 && !this.state.isPlaying) {
      this.autoPauseController.setAutoPaused(false);
      this.play().catch(() => {});
    }
    
    this.maybeAutoPauseIfSilent();
  }

  public refreshAudioPlayers(): void {
    this.fileAudioController.refreshAudioPlayers();
    this.maybeAutoPauseIfSilent();
  }

  public getState(): AudioPlayerState {
    return { ...this.state };
  }

  public destroy(): void {
    console.log("[AudioPlayer] Destroying audio player");
    
    this.transportSyncManager.stopSyncScheduler();
    this.removeTransportCallbacks();
    
    this.samplerManager.destroy();
    this.wavPlayerManager.destroy();
    
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.loop = false;
    transport.loopStart = 0;
    transport.loopEnd = 0;
    
    this.autoPauseController.reset();
    this.isInitialized = false;
  }

  // Private helper methods

  private handlePlaybackEnd(): void {
    this.playbackController.handlePlaybackEnd();
  }

  private handleFileSettingsChange(): void {
    this.maybeAutoPauseIfSilent();
  }

  private maybeAutoPauseIfSilent(): void {
    if (this.autoPauseController.maybeAutoPause()) {
      return;
    }
    
    // Check for auto-resume
    this.autoPauseController.maybeAutoResume();
  }
}

/**
 * Create a new audio player instance
 */
export function createAudioPlayer(
  notes: NoteData[],
  pianoRoll: PianoRollSync,
  options?: PlayerOptions,
  midiManager?: any
): AudioPlayer {
  return new AudioPlayer(notes, pianoRoll, options, midiManager);
}