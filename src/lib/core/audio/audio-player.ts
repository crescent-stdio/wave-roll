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
import { ensureAudioContextReady } from "./utils/audio-context";

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

  // Visual update callback
  private visualUpdateCallback?: (params: { currentTime: number; duration: number; isPlaying: boolean }) => void;

  // Player state
  private state: AudioPlayerState;
  private originalTempo: number;
  private isInitialized = false;
  private isHandlingLoop = false;
  
  private updateAllUI(time: number, force: boolean = false): void {
    try {
      // 1) Piano roll update
      this.pianoRoll.setTime(time);
    } catch {}

    // 2) Notify visual update listeners (seekbar/time display)
    try {
      if (this.visualUpdateCallback) {
        this.visualUpdateCallback({
          currentTime: time,
          duration: this.state.duration,
          isPlaying: this.state.isPlaying,
        });
      }
    } catch {}

    if (force) {
      // Keep internal state and transport in sync
      this.state.currentTime = time;
      try {
        const t = this.transportSyncManager.visualToTransportTime(time);
        const transport = Tone.getTransport();
        transport.seconds = t;
      } catch {}
    }
  }
  private initPromise: Promise<void>;

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
    // Skip loop handling while we are in the middle of a restart
    // (e.g., tempo/playback-rate change). This prevents creating a new Part
    // concurrently with the restart path and avoids double playback.
    if (this.operationState.isRestarting || this.operationState.isSeeking) {
      return;
    }
    // Prevent handling multiple loop events simultaneously
    if (this.isHandlingLoop) {
      console.log("[AudioPlayer] Ignoring duplicate loop event");
      return;
    }
    
    this.isHandlingLoop = true;
    
    const visualStart = this.loopManager.handleLoopEvent();
    
    // Check if transport loop was triggered while we were stopped at the end
    // This can happen when enabling loop after playback ended
    const wasStoppedAtEnd = !this.state.isPlaying && 
                            this.state.currentTime >= this.state.duration - 0.01;
    
    // Make sure we're marked as playing when loop restarts
    if (!this.state.isPlaying) {
      this.state.isPlaying = true;
      this.transportSyncManager.startSyncScheduler();
    }
    
    this.transportSyncManager.handleTransportLoop(
      this.loopManager.loopStartVisual,
      this.loopManager.loopEndVisual
    );

    // Use SamplerManager methods instead of direct Part manipulation
    if (!wasStoppedAtEnd) {
      // Stop current part safely
      this.samplerManager.stopPart();
      
      // Re-setup and start Part at loop start
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
      
      // Start Part immediately at the loop start
      this.samplerManager.startPart(0, 0);
    } else if (wasStoppedAtEnd) {
      // If we were stopped at the end, reset position to start
      this.playbackController.setPausedTime(0);
      this.state.currentTime = 0;
      this.pianoRoll.setTime(0);
      
      // Also reset Transport position
      Tone.getTransport().seconds = 0;
      
      // Set up the Part properly but don't start it
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
      // Mark as not playing since we're waiting for user action
      this.state.isPlaying = false;
      this.transportSyncManager.stopSyncScheduler();
    }
    
    // Restart WAV players at the loop start position only if actually playing
    if (this.wavPlayerManager.isAudioActive() && visualStart !== null && !wasStoppedAtEnd) {
      this.wavPlayerManager.restartAtPosition(visualStart);
    }
    
    this.operationState.lastLoopJumpTime = Date.now();
    this.isHandlingLoop = false;
  };

  constructor(
    notes: NoteData[],
    pianoRoll: PianoRollSync,
    options?: PlayerOptions,
    midiManager?: any
  ) {
    // Clean up any existing instance first
    this.cleanup();
    
    // Initialize basic properties
    this.notes = notes;
    this.pianoRoll = pianoRoll;
    this.midiManager = midiManager;
    
    // Merge options with defaults
    this.options = {
      tempo: 120,
      volume: 0.7,
      repeat: false,
      soundFont: "",
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
    this.wavPlayerManager = new WavPlayerManager();
    this.transportSyncManager = new TransportSyncManager(
      pianoRoll,
      this.state,
      this.operationState,
      this.originalTempo
    );
    this.loopManager = new LoopManager(this.originalTempo);

    // Initialize FileAudioController first (needed by PlaybackController)
    this.fileAudioController = new FileAudioController({
      samplerManager: this.samplerManager,
      wavPlayerManager: this.wavPlayerManager,
      midiManager: this.midiManager,
      onFileSettingsChange: () => this.handleFileSettingsChange(),
    });

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
      uiSync: (time: number, force?: boolean) => this.updateAllUI(time, !!force),
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
      pianoRoll: this.pianoRoll,
      onVolumeChange: () => this.maybeAutoPauseIfSilent(),
      onVisualUpdate: (params) => {
        if (this.visualUpdateCallback) {
          this.visualUpdateCallback(params);
        }
      },
    });

    this.autoPauseController = new AutoPauseController({
      state: this.state,
      checkAllMuted: () => this.fileAudioController.areAllFilesMuted(),
      checkAllZeroVolume: () => this.fileAudioController.areAllFilesZeroVolume(),
      onAutoPause: () => this.pause(),
      onAutoResume: () => this.play().catch(() => {}),
    });

    // Initialize audio system (defer play/seek until ready)
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure audio context is properly configured
      await ensureAudioContextReady();
      
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
      
      // Set up end callback for auto-pause at duration
      this.transportSyncManager.setEndCallback(() => {
        this.handlePlaybackEnd();
      });

      // Prebuild WAV players from registry (if any) to avoid first-play stutter
      try {
        this.fileAudioController.refreshAudioPlayers();
      } catch {}

      this.isInitialized = true;
      console.log("[AudioPlayer] Initialized successfully");
    } catch (error) {
      console.error("[AudioPlayer] Failed to initialize:", error);
      throw error;
    }
  }

  private setupTransportCallbacks(): void {
    const transport = Tone.getTransport();
    // Remove ALL existing listeners first to ensure clean slate
    if (typeof (transport as any).off === 'function') {
      (transport as any).off("stop");
      (transport as any).off("pause");
      (transport as any).off("loop");
    }
    
    // Then add our specific handlers
    if (typeof (transport as any).on === 'function') {
      (transport as any).on("stop", this.handleTransportStop);
      (transport as any).on("pause", this.handleTransportPause);
      (transport as any).on("loop", this.handleTransportLoop);
    }
  }

  private removeTransportCallbacks(): void {
    const transport = Tone.getTransport();
    if (typeof (transport as any).off === 'function') {
      (transport as any).off("stop", this.handleTransportStop);
      (transport as any).off("pause", this.handleTransportPause);
      (transport as any).off("loop", this.handleTransportLoop);
    }
  }
  
  private cleanup(): void {
    // Clean up any existing transport callbacks
    try {
      const transport = Tone.getTransport();
      transport.off("stop");
      transport.off("pause");
      transport.off("loop");
    } catch {}
  }

  // Public API - delegate to controllers

  public async play(): Promise<void> {
    // Ensure audio context/samplers/transport are ready before starting
    try {
      await this.initPromise;
    } catch {}
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
    // Store state before making changes
    const wasAutoPaused = this.autoPauseController.isAutoPaused();
    const pausedPosition = this.playbackController.getPausedTime();
    
    this.fileAudioController.setFileMute(fileId, mute);
    // Auto-pause/resume is handled via onFileSettingsChange callback
    
    // Handle re-scheduling when unmuting
    if (!mute) {
      // Check if we just auto-resumed from being fully muted
      const isNowPlaying = this.state.isPlaying;
      const didAutoResume = wasAutoPaused && isNowPlaying;
      
      if (isNowPlaying) {
        // Ensure track is audible and retrigger held notes
        this.samplerManager.ensureTrackAudible(fileId, this.state.volume);
        
        // If global volume is 0, restore it
        if (this.state.volume === 0) {
          const restore = this.options.volume > 0 ? this.options.volume : 0.7;
          this.setVolume(restore);
        }
        
        // If we auto-resumed, we need to ensure both MIDI and WAV are properly synced
        if (didAutoResume) {
          try {
            // Use the paused position for proper sync
            const visualPosition = this.transportSyncManager.transportToVisualTime(pausedPosition);
            const transportSeconds = pausedPosition;
            
            // Ensure transport is at correct position
            Tone.getTransport().seconds = transportSeconds;
            
            // Reschedule MIDI Part from the paused position
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
            const relativeOffset = this.loopManager.getPartOffset(visualPosition, transportSeconds);
            const relativeTransportOffset = this.transportSyncManager.visualToTransportTime(relativeOffset);
            this.samplerManager.startPart("+0.01", relativeTransportOffset);
            
            // Restart WAV players at the same position
            if (this.wavPlayerManager.isAudioActive()) {
              this.wavPlayerManager.stopAllAudioPlayers();
              this.wavPlayerManager.startActiveAudioAt(visualPosition, "+0.01");
            }
          } catch (e) {
            console.error("[setFileMute] Error syncing after auto-resume:", e);
          }
        } else {
          // Regular unmute while already playing - just retrigger held notes
          setTimeout(() => {
            this.samplerManager.retriggerHeldNotes(fileId, this.state.currentTime);
          }, 30);

          // Ensure WAV playback for newly unmuted files starts at current position
          try {
            if (this.wavPlayerManager.isAudioActive()) {
              this.wavPlayerManager.startActiveAudioAt(this.state.currentTime, "+0.01");
            }
          } catch {}
        }
      }
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
    if (!this.state.isRepeating) {
      // Ensure we pause properly
      this.pause();
      
      // Set position to exact duration
      this.state.currentTime = this.state.duration;
      this.pianoRoll.setTime(this.state.duration);
      
      // Call user callback if provided
      if (this.options.onPlaybackEnd) {
        this.options.onPlaybackEnd();
      }
    }
  }

  private handleFileSettingsChange(): void {
    this.maybeAutoPauseIfSilent();
  }

  private maybeAutoPauseIfSilent(): void {
    // Store current position before auto-pause
    const currentPosition = this.state.currentTime;
    const wasPlaying = this.state.isPlaying;
    
    if (this.autoPauseController.maybeAutoPause()) {
      return;
    }
    
    // Check for auto-resume
    const shouldResume = this.autoPauseController.maybeAutoResume();
    
    // If we auto-resumed, ensure WAV and MIDI are synchronized
    if (shouldResume && !wasPlaying && this.state.isPlaying) {
      // Small delay to ensure everything is properly initialized
      setTimeout(() => {
        // Refresh WAV player positions to match current transport position
        if (this.wavPlayerManager.isAudioActive()) {
          const currentVisual = this.state.currentTime;
          this.wavPlayerManager.stopAllAudioPlayers();
          this.wavPlayerManager.startActiveAudioAt(currentVisual, "+0.01");
        }
      }, 50);
    }
  }

  // Visual update callback management
  public setOnVisualUpdate(callback: (params: { currentTime: number; duration: number; isPlaying: boolean }) => void): void {
    this.visualUpdateCallback = callback;
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
