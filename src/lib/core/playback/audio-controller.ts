/**
 * AudioController - Legacy wrapper around CorePlaybackEngine for audio control
 * Maintains backward compatibility while delegating to unified engine
 */

import { StateManager } from "@/core/state";
import { formatTime } from "@/core/utils";
import { NoteData } from "@/lib/midi/types";
import {
  CorePlaybackEngine,
  createCorePlaybackEngine,
  PianoRollManager,
  createPianoRollManager,
} from "@/core/playback";
import { PlaybackValueUtils } from "./utils";

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
 * AudioController - Thin wrapper around CorePlaybackEngine
 * Maintains backward compatibility for existing code
 */
export class AudioController {
  private coreEngine: CorePlaybackEngine;
  private pianoRollManager: PianoRollManager | null = null;
  private stateManager: StateManager;
  private config: AudioControllerConfig;
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

    // Create core engine with state manager
    this.coreEngine = createCorePlaybackEngine(stateManager, {
      defaultVolume: this.config.defaultVolume,
      defaultTempo: this.config.defaultTempo,
      minTempo: this.config.minTempo,
      maxTempo: this.config.maxTempo,
      updateInterval: this.config.updateInterval,
      enableStateSync: true,
    });
  }

  /**
   * Initialize audio player with notes and piano roll instance
   */
  public async initializeAudioPlayer(
    notes: NoteData[],
    pianoRollInstance: import("@/core/playback").PianoRollInstance
  ): Promise<void> {
    // Create a minimal piano roll manager if we don't have one
    if (!this.pianoRollManager) {
      this.pianoRollManager = createPianoRollManager();
    }

    // Initialize piano roll manager with provided instance
    // This is a bit of a hack to maintain backward compatibility
    if (pianoRollInstance) {
      // Store reference to external piano roll instance (compatibility path)
      (this.pianoRollManager as unknown as {
        pianoRollInstance: import("@/core/playback").PianoRollInstance | null;
      }).pianoRollInstance = pianoRollInstance;
    }

    // Initialize core engine
    await this.coreEngine.initialize(this.pianoRollManager);

    // Update audio with notes
    await this.coreEngine.updateAudio(notes);
  }

  /**
   * Recreate audio player with new notes (preserving state)
   */
  public async recreateAudioPlayer(notes: NoteData[]): Promise<void> {
    await this.coreEngine.updateAudio(notes);
  }

  /**
   * Start audio playback
   */
  public async play(): Promise<void> {
    await this.coreEngine.play();
  }

  /**
   * Pause audio playback
   */
  public pause(): void {
    this.coreEngine.pause();
  }

  /**
   * Restart audio playback from beginning
   */
  public restart(): void {
    this.coreEngine.restart();
  }

  /**
   * Seek to specific time position
   */
  public seek(seconds: number, updateVisual: boolean = true): void {
    this.coreEngine.seek(seconds, updateVisual);
  }

  /**
   * Set playback volume
   */
  public setVolume(volume: number): void {
    this.coreEngine.setVolume(volume);
  }

  /**
   * Set playback tempo
   */
  public setTempo(bpm: number): void {
    this.coreEngine.setTempo(bpm);
  }

  /**
   * Set stereo pan value
   */
  public setPan(pan: number): void {
    this.coreEngine.setPan(pan);
  }

  /**
   * Toggle repeat mode
   */
  public toggleRepeat(enabled: boolean): void {
    this.coreEngine.toggleRepeat(enabled);
  }

  /**
   * Set A-B loop points
   */
  public setLoopPoints(start: number | null, end: number | null): void {
    this.loopPoints = { a: start, b: end };
    this.coreEngine.setLoopPoints(start, end);
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
  public getState(): AudioPlayerState {
    const state = this.coreEngine.getState();
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
    this.coreEngine.handleChannelMute(shouldMute);
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
    const rect = seekBarElement.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const state = this.coreEngine.getState();

    if (state.duration > 0) {
      const seekTime = percent * state.duration;
      this.seek(seekTime);
    }
  }

  /**
   * Handle loop restart (jump to loop start and play)
   */
  public handleLoopRestart(): void {
    const startPoint = this.loopPoints.a ?? 0;
    this.seek(startPoint);

    if (!this.coreEngine.getState().isPlaying) {
      this.play();
    }
  }

  /**
   * Get formatted time string
   */
  public getFormattedTime(): { current: string; total: string } {
    const state = this.coreEngine.getState();
    return {
      current: formatTime(state.currentTime),
      total: formatTime(state.duration),
    };
  }

  /**
   * Get current playback progress as percentage
   */
  public getProgress(): number {
    const state = this.coreEngine.getState();
    if (state.duration === 0) return 0;
    return (state.currentTime / state.duration) * 100;
  }

  /**
   * Destroy audio controller and cleanup resources
   */
  public destroy(): void {
    this.coreEngine.destroy();
    this.pianoRollManager = null;
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
 * @deprecated Use PlaybackValueUtils from './utils' instead
 */
export const AudioControllerUtils = PlaybackValueUtils;
