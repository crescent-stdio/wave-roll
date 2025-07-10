/**
 * AudioController - Handles audio player integration and control logic
 * Manages audio playback, controls, loop functionality, and state synchronization
 */

import {
  createAudioPlayer,
  AudioPlayerControls,
} from "@/components/audio-player";
import { NoteData } from "src/lib/types";
import { StateManager } from "./StateManager";
import { formatTime } from "./StateManager";

/**
 * Audio player state interface
 */
export interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  tempo: number;
  pan: number;
  isRepeating: boolean;
}

/**
 * Loop points interface
 */
export interface LoopPoints {
  a: number | null;
  b: number | null;
}

/**
 * Audio controller configuration
 */
export interface AudioControllerConfig {
  defaultVolume: number;
  defaultTempo: number;
  minTempo: number;
  maxTempo: number;
  updateInterval: number;
}

/**
 * Audio controller handles all audio-related operations
 */
export class AudioController {
  private audioPlayer: AudioPlayerControls | null = null;
  private pianoRollInstance: any = null;
  private stateManager: StateManager;
  private config: AudioControllerConfig;
  private updateLoopId: number | null = null;
  private loopPoints: LoopPoints = { a: null, b: null };
  private seeking: boolean = false;
  private muteDueNoLR: boolean = false;
  private lastVolumeBeforeMute: number = 0.7;

  constructor(
    stateManager: StateManager,
    config?: Partial<AudioControllerConfig>
  ) {
    this.stateManager = stateManager;
    this.config = {
      defaultVolume: 0.7,
      defaultTempo: 120,
      minTempo: 30,
      maxTempo: 300,
      updateInterval: 50,
      ...config,
    };
  }

  /**
   * Initialize audio player with notes and piano roll instance
   */
  public async initializeAudioPlayer(
    notes: NoteData[],
    pianoRollInstance: any
  ): Promise<void> {
    this.pianoRollInstance = pianoRollInstance;

    // Destroy existing audio player if any
    if (this.audioPlayer) {
      this.audioPlayer.destroy();
      this.audioPlayer = null;
    }

    // Create new audio player
    this.audioPlayer = createAudioPlayer(notes, pianoRollInstance, {
      tempo: this.config.defaultTempo,
      volume: this.config.defaultVolume,
      repeat: false,
    });

    // Start update loop
    this.startUpdateLoop();
  }

  /**
   * Recreate audio player with new notes (preserving state)
   */
  public async recreateAudioPlayer(notes: NoteData[]): Promise<void> {
    if (!this.pianoRollInstance) {
      throw new Error("Piano roll instance not initialized");
    }

    // Preserve current state
    const prevState = this.audioPlayer?.getState();
    const prevVolume = prevState?.volume ?? this.config.defaultVolume;
    const prevTempo = prevState?.tempo ?? this.config.defaultTempo;
    const prevPan = prevState?.pan ?? 0;
    const prevTime = prevState?.currentTime ?? 0;
    const wasPlaying = prevState?.isPlaying ?? false;

    // Destroy existing player
    if (this.audioPlayer) {
      this.audioPlayer.destroy();
      this.audioPlayer = null;
    }

    // Create new player with preserved settings
    this.audioPlayer = createAudioPlayer(notes, this.pianoRollInstance, {
      tempo: prevTempo,
      volume: prevVolume,
      repeat: false,
    });

    // Restore previous state
    this.audioPlayer.setPan(prevPan);

    // Restore playback position and state
    if (prevTime > 0) {
      this.audioPlayer.seek(prevTime, false);
    }

    // Resume playback if it was playing
    if (wasPlaying) {
      try {
        await this.audioPlayer.play();
      } catch (error) {
        console.error(
          "Failed to resume playback after player recreation:",
          error
        );
      }
    }
  }

  /**
   * Start audio playback
   */
  public async play(): Promise<void> {
    if (!this.audioPlayer) {
      throw new Error("Audio player not initialized");
    }

    try {
      await this.audioPlayer.play();
    } catch (error) {
      console.error("Failed to start playback:", error);
      throw error;
    }
  }

  /**
   * Pause audio playback
   */
  public pause(): void {
    if (!this.audioPlayer) return;
    this.audioPlayer.pause();
  }

  /**
   * Restart audio playback from beginning
   */
  public restart(): void {
    if (!this.audioPlayer) return;
    this.audioPlayer.restart();
  }

  /**
   * Seek to specific time position
   */
  public seek(seconds: number, updateVisual: boolean = true): void {
    if (!this.audioPlayer) return;
    this.audioPlayer.seek(seconds, updateVisual);
  }

  /**
   * Set playback volume
   */
  public setVolume(volume: number): void {
    if (!this.audioPlayer) return;
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.audioPlayer.setVolume(clampedVolume);
    this.stateManager.updatePlaybackState({ volume: clampedVolume });
  }

  /**
   * Set playback tempo
   */
  public setTempo(bpm: number): void {
    if (!this.audioPlayer) return;
    const clampedTempo = Math.max(
      this.config.minTempo,
      Math.min(this.config.maxTempo, bpm)
    );
    this.audioPlayer.setTempo(clampedTempo);
  }

  /**
   * Set stereo pan value
   */
  public setPan(pan: number): void {
    if (!this.audioPlayer) return;
    this.audioPlayer.setPan(pan);
  }

  /**
   * Toggle repeat mode
   */
  public toggleRepeat(enabled: boolean): void {
    if (!this.audioPlayer) return;
    this.audioPlayer.toggleRepeat(enabled);
  }

  /**
   * Set A-B loop points
   */
  public setLoopPoints(start: number | null, end: number | null): void {
    if (!this.audioPlayer) return;

    this.loopPoints = { a: start, b: end };
    this.audioPlayer.setLoopPoints(start, end);
    this.stateManager.setLoopPoints(start, end);
  }

  /**
   * Clear loop points
   */
  public clearLoopPoints(): void {
    this.setLoopPoints(null, null);
  }

  /**
   * Get current audio player state
   */
  public getState(): AudioPlayerState | null {
    if (!this.audioPlayer) return null;

    const state = this.audioPlayer.getState();
    return {
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      duration: state.duration,
      volume: state.volume,
      tempo: state.tempo,
      pan: state.pan,
      isRepeating: state.isRepeating,
    };
  }

  /**
   * Get loop points
   */
  public getLoopPoints(): LoopPoints {
    return { ...this.loopPoints };
  }

  /**
   * Handle mute/unmute for L/R channel controls
   */
  public handleChannelMute(shouldMute: boolean): void {
    if (!this.audioPlayer) return;

    if (shouldMute) {
      if (!this.muteDueNoLR) {
        this.lastVolumeBeforeMute = this.audioPlayer.getState().volume;
        this.audioPlayer.setVolume(0);
        this.muteDueNoLR = true;
      }
    } else {
      if (this.muteDueNoLR) {
        this.audioPlayer.setVolume(this.lastVolumeBeforeMute);
        this.muteDueNoLR = false;
      }
    }
  }

  /**
   * Start update loop for synchronizing UI with audio state
   */
  private startUpdateLoop(): void {
    if (this.updateLoopId !== null) return;

    this.updateLoopId = window.setInterval(() => {
      this.updateAudioState();
    }, this.config.updateInterval);
  }

  /**
   * Stop update loop
   */
  private stopUpdateLoop(): void {
    if (this.updateLoopId !== null) {
      clearInterval(this.updateLoopId);
      this.updateLoopId = null;
    }
  }

  /**
   * Update audio state and sync with state manager
   */
  private updateAudioState(): void {
    if (!this.audioPlayer) return;

    const state = this.audioPlayer.getState();

    // Update state manager with current audio state
    this.stateManager.updatePlaybackState({
      currentTime: state.currentTime,
      duration: state.duration,
      isPlaying: state.isPlaying,
      volume: state.volume,
    });
  }

  /**
   * Set seeking state
   */
  public setSeeking(seeking: boolean): void {
    this.seeking = seeking;
    this.stateManager.updateUIState({ seeking });
  }

  /**
   * Check if currently seeking
   */
  public isSeeking(): boolean {
    return this.seeking;
  }

  /**
   * Handle seek bar interaction
   */
  public handleSeekBarClick(
    event: MouseEvent,
    seekBarElement: HTMLElement
  ): void {
    if (!this.audioPlayer) return;

    const rect = seekBarElement.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const state = this.audioPlayer.getState();

    if (state.duration > 0) {
      const seekTime = percent * state.duration;
      this.seek(seekTime);
    }
  }

  /**
   * Handle loop restart (jump to loop start and play)
   */
  public handleLoopRestart(): void {
    if (!this.audioPlayer) return;

    const startPoint = this.loopPoints.a ?? 0;
    this.seek(startPoint);

    if (!this.audioPlayer.getState().isPlaying) {
      this.play();
    }
  }

  /**
   * Get formatted time string
   */
  public getFormattedTime(): { current: string; total: string } {
    if (!this.audioPlayer) {
      return { current: "00:00", total: "00:00" };
    }

    const state = this.audioPlayer.getState();
    return {
      current: formatTime(state.currentTime),
      total: formatTime(state.duration),
    };
  }

  /**
   * Get current playback progress as percentage
   */
  public getProgress(): number {
    if (!this.audioPlayer) return 0;

    const state = this.audioPlayer.getState();
    if (state.duration === 0) return 0;

    return (state.currentTime / state.duration) * 100;
  }

  /**
   * Destroy audio controller and cleanup resources
   */
  public destroy(): void {
    this.stopUpdateLoop();

    if (this.audioPlayer) {
      this.audioPlayer.destroy();
      this.audioPlayer = null;
    }

    this.pianoRollInstance = null;
  }
}

/**
 * Create audio controller instance
 */
export function createAudioController(
  stateManager: StateManager,
  config?: Partial<AudioControllerConfig>
): AudioController {
  return new AudioController(stateManager, config);
}

/**
 * Audio controller utility functions
 */
export const AudioControllerUtils = {
  /**
   * Clamp tempo value within valid range
   */
  clampTempo: (tempo: number, min: number = 30, max: number = 300): number => {
    return Math.max(min, Math.min(max, tempo));
  },

  /**
   * Clamp volume value within valid range
   */
  clampVolume: (volume: number): number => {
    return Math.max(0, Math.min(1, volume));
  },

  /**
   * Clamp pan value within valid range
   */
  clampPan: (pan: number): number => {
    return Math.max(-1, Math.min(1, pan));
  },

  /**
   * Convert time to percentage
   */
  timeToPercent: (time: number, duration: number): number => {
    if (duration === 0) return 0;
    return (time / duration) * 100;
  },

  /**
   * Convert percentage to time
   */
  percentToTime: (percent: number, duration: number): number => {
    return (percent / 100) * duration;
  },
};
