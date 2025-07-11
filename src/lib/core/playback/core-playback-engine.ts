/**
 * CorePlaybackEngine - Unified playback engine for audio and visualization
 *
 * Consolidates AudioController and VisualizationEngine functionality into a single
 * cohesive engine that manages one AudioPlayer instance and coordinates with
 * PianoRoll visualization.
 */

import { NoteData } from "@/lib/midi/types";
import {
  AudioPlayerContainer,
  AudioPlayerState,
  createAudioPlayer,
} from "@/core/audio";
import { PianoRollManager } from "@/core/playback";
import { StateManager } from "@/core/state";

/**
 * Core playback engine configuration
 */
export interface CorePlaybackEngineConfig {
  /** Default volume (0-1) */
  defaultVolume?: number;
  /** Default tempo in BPM */
  defaultTempo?: number;
  /** Min tempo in BPM */
  minTempo?: number;
  /** Max tempo in BPM */
  maxTempo?: number;
  /** Update interval for UI sync in ms */
  updateInterval?: number;
  /** Enable state manager integration */
  enableStateSync?: boolean;
}

/**
 * Visual update callback parameters
 */
export interface VisualUpdateParams {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  tempo: number;
  pan: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<CorePlaybackEngineConfig> = {
  defaultVolume: 0.7,
  defaultTempo: 120,
  minTempo: 30,
  maxTempo: 300,
  updateInterval: 50,
  enableStateSync: true,
};

/**
 * CorePlaybackEngine - Single source of truth for playback control
 *
 * This engine manages:
 * - Single AudioPlayer instance
 * - Synchronization with PianoRoll visualization
 * - State management integration (optional)
 * - UI update callbacks
 */
export class CorePlaybackEngine implements AudioPlayerContainer {
  private audioPlayer: AudioPlayerContainer | null = null;
  private pianoRollManager: PianoRollManager | null = null;
  private stateManager: StateManager | null = null;
  private config: Required<CorePlaybackEngineConfig>;

  // Update management
  private updateLoopId: number | null = null;
  private visualUpdateCallbacks: ((params: VisualUpdateParams) => void)[] = [];

  // State tracking
  private loopPoints: { a: number | null; b: number | null } = {
    a: null,
    b: null,
  };
  private seeking = false;
  private muteDueNoLR = false;
  private lastVolumeBeforeMute = 0.7;

  // Signature tracking to avoid redundant recreations
  private lastAudioSignature = "";

  // Cache last known state to prevent flickering during recreation
  private lastKnownState: AudioPlayerState | null = null;

  constructor(
    stateManager?: StateManager,
    config: CorePlaybackEngineConfig = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stateManager = stateManager || null;
  }

  /**
   * Initialize the engine with PianoRoll manager
   */
  public async initialize(pianoRollManager: PianoRollManager): Promise<void> {
    this.pianoRollManager = pianoRollManager;

    // Set up PianoRoll time change callback
    const pianoRollInstance = pianoRollManager.getPianoRollInstance();
    if (pianoRollInstance?.onTimeChange) {
      pianoRollInstance.onTimeChange((time: number) => {
        this.seek(time, false);
      });
    }
  }

  /**
   * Update audio with new notes
   */
  public async updateAudio(notes: NoteData[]): Promise<void> {
    const signature = this.getNotesSignature(notes);

    // Skip if notes haven't changed
    if (signature === this.lastAudioSignature && this.audioPlayer) {
      return;
    }

    await this.recreateAudioPlayer(notes);
    this.lastAudioSignature = signature;
  }

  /**
   * Recreate audio player with new notes
   */
  private async recreateAudioPlayer(notes: NoteData[]): Promise<void> {
    if (!this.pianoRollManager) {
      throw new Error("PianoRollManager not initialized");
    }

    // Preserve current state
    const prevState = this.audioPlayer?.getState();
    const wasPlaying = prevState?.isPlaying || false;

    // Update cached state before destroying player
    if (prevState) {
      this.lastKnownState = prevState;
    }

    // Destroy existing player
    if (this.audioPlayer) {
      this.audioPlayer.destroy();
      this.audioPlayer = null;
    }

    // Get PianoRoll instance for sync
    const pianoRollInstance = this.pianoRollManager.getPianoRollInstance();
    if (!pianoRollInstance) {
      throw new Error("PianoRoll instance not available");
    }

    // Create new player with preserved settings
    this.audioPlayer = createAudioPlayer(notes, pianoRollInstance, {
      tempo: prevState?.tempo || this.config.defaultTempo,
      volume: prevState?.volume || this.config.defaultVolume,
      repeat: prevState?.isRepeating || false,
    });

    // Restore state
    if (prevState) {
      this.audioPlayer.setPan(prevState.pan);

      if (prevState.currentTime > 0) {
        this.audioPlayer.seek(prevState.currentTime, false);
      }

      // Restore loop points
      if (this.loopPoints.a !== null || this.loopPoints.b !== null) {
        this.audioPlayer.setLoopPoints(this.loopPoints.a, this.loopPoints.b);
      }

      // Resume playback if needed
      if (wasPlaying) {
        try {
          await this.audioPlayer.play();
        } catch (error) {
          console.error("Failed to resume playback after recreation:", error);
        }
      }
    }

    // Sync with state manager if enabled
    if (this.config.enableStateSync && this.stateManager) {
      this.syncWithStateManager();
    }
  }

  /**
   * AudioPlayerContainer implementation
   */
  public async play(): Promise<void> {
    if (!this.audioPlayer) {
      throw new Error("Audio player not initialized");
    }

    // Get state before playing to check if we're starting from the beginning
    const stateBefore = this.audioPlayer.getState();
    const isStartingFromBeginning = stateBefore.currentTime === 0;

    await this.audioPlayer.play();

    // Start update loop immediately
    this.startUpdateLoop();

    // If starting from 0:00, ensure initial position is set immediately
    if (isStartingFromBeginning && this.pianoRollManager) {
      this.pianoRollManager.setTime(0);

      // Force an immediate visual update callback
      const updateParams: VisualUpdateParams = {
        currentTime: 0,
        duration: stateBefore.duration,
        isPlaying: true,
        volume: stateBefore.volume,
        tempo: stateBefore.tempo,
        pan: stateBefore.pan,
      };

      this.visualUpdateCallbacks.forEach((callback) => {
        try {
          callback(updateParams);
        } catch (error) {
          console.error("Error in visual update callback:", error);
        }
      });
    }

    // Schedule another update after a short delay to ensure transport is ready
    setTimeout(() => {
      if (this.audioPlayer && this.pianoRollManager) {
        const state = this.audioPlayer.getState();
        this.pianoRollManager.setTime(state.currentTime);

        // Trigger visual update callbacks again
        const updateParams: VisualUpdateParams = {
          currentTime: state.currentTime,
          duration: state.duration,
          isPlaying: state.isPlaying,
          volume: state.volume,
          tempo: state.tempo,
          pan: state.pan,
        };

        this.visualUpdateCallbacks.forEach((callback) => {
          try {
            callback(updateParams);
          } catch (error) {
            console.error("Error in visual update callback:", error);
          }
        });
      }
    }, 50);
  }

  public pause(): void {
    this.audioPlayer?.pause();
    this.stopUpdateLoop();
  }

  public restart(): void {
    this.audioPlayer?.restart();
  }

  public toggleRepeat(enabled: boolean): void {
    this.audioPlayer?.toggleRepeat(enabled);
  }

  public seek(seconds: number, updateVisual = true): void {
    if (!this.audioPlayer) return;

    this.seeking = true;
    this.audioPlayer.seek(seconds, updateVisual);

    if (updateVisual && this.pianoRollManager) {
      this.pianoRollManager.setTime(seconds);
    }

    setTimeout(() => {
      this.seeking = false;
    }, 50);
  }

  public setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.audioPlayer?.setVolume(clampedVolume);

    if (this.config.enableStateSync && this.stateManager) {
      this.stateManager.updatePlaybackState({ volume: clampedVolume });
    }
  }

  public setTempo(bpm: number): void {
    const clampedTempo = Math.max(
      this.config.minTempo,
      Math.min(this.config.maxTempo, bpm)
    );
    this.audioPlayer?.setTempo(clampedTempo);
  }

  public setLoopPoints(start: number | null, end: number | null): void {
    this.loopPoints = { a: start, b: end };
    this.audioPlayer?.setLoopPoints(start, end);

    if (this.config.enableStateSync && this.stateManager) {
      this.stateManager.setLoopPoints(start, end);
    }
  }

  public setPan(pan: number): void {
    this.audioPlayer?.setPan(pan);
  }

  public getState(): AudioPlayerState {
    if (!this.audioPlayer) {
      // Return last known state if available to prevent flickering
      if (this.lastKnownState) {
        // Ensure isPlaying is false when audio player is null
        return {
          ...this.lastKnownState,
          isPlaying: false,
        };
      }

      // Fall back to default state
      return {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: this.config.defaultVolume,
        tempo: this.config.defaultTempo,
        originalTempo: this.config.defaultTempo,
        pan: 0,
        isRepeating: false,
      };
    }

    // Get current state and cache it
    const currentState = this.audioPlayer.getState();
    this.lastKnownState = currentState;
    return currentState;
  }

  public destroy(): void {
    this.stopUpdateLoop();
    this.visualUpdateCallbacks = [];

    if (this.audioPlayer) {
      this.audioPlayer.destroy();
      this.audioPlayer = null;
    }

    this.pianoRollManager = null;
    this.stateManager = null;
  }

  /**
   * Additional methods for UI integration
   */

  /**
   * Register visual update callback
   */
  public onVisualUpdate(callback: (params: VisualUpdateParams) => void): void {
    this.visualUpdateCallbacks.push(callback);
  }

  /**
   * Remove visual update callback
   */
  public offVisualUpdate(callback: (params: VisualUpdateParams) => void): void {
    const index = this.visualUpdateCallbacks.indexOf(callback);
    if (index > -1) {
      this.visualUpdateCallbacks.splice(index, 1);
    }
  }

  /**
   * Handle channel mute for L/R controls
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
   * Get PianoRollManager instance
   */
  public getPianoRollManager(): PianoRollManager | null {
    return this.pianoRollManager;
  }

  /**
   * Check if engine is initialized
   */
  public isInitialized(): boolean {
    return this.audioPlayer !== null && this.pianoRollManager !== null;
  }

  /**
   * Private helper methods
   */

  private getNotesSignature(notes: NoteData[]): string {
    if (notes.length === 0) return "0";

    const sorted = [...notes].sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time;
      return a.midi - b.midi;
    });

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return `${sorted.length}:${first.time}-${first.midi}:${last.time}-${last.midi}`;
  }

  private startUpdateLoop(): void {
    if (this.updateLoopId !== null) return;

    // console.log("[CorePlaybackEngine] startUpdateLoop");
    const performUpdate = () => {
      if (!this.audioPlayer || this.seeking) return;

      const state = this.audioPlayer.getState();

      // Sync with StateManager
      if (this.config.enableStateSync && this.stateManager) {
        this.stateManager.updatePlaybackState({
          currentTime: state.currentTime,
          duration: state.duration,
          isPlaying: state.isPlaying,
          volume: state.volume,
        });
      }

      // Notify visual update callbacks
      const updateParams: VisualUpdateParams = {
        currentTime: state.currentTime,
        duration: state.duration,
        isPlaying: state.isPlaying,
        volume: state.volume,
        tempo: state.tempo,
        pan: state.pan,
      };

      this.visualUpdateCallbacks.forEach((callback) => {
        try {
          callback(updateParams);
        } catch (error) {
          console.error("Error in visual update callback:", error);
        }
      });
    };

    // Immediate update
    performUpdate();

    // Start interval
    this.updateLoopId = window.setInterval(
      performUpdate,
      this.config.updateInterval
    );
  }

  private stopUpdateLoop(): void {
    if (this.updateLoopId !== null) {
      clearInterval(this.updateLoopId);
      this.updateLoopId = null;
    }
  }

  private syncWithStateManager(): void {
    if (!this.stateManager || !this.audioPlayer) return;

    const state = this.audioPlayer.getState();
    this.stateManager.updatePlaybackState({
      currentTime: state.currentTime,
      duration: state.duration,
      isPlaying: state.isPlaying,
      volume: state.volume,
    });
  }
}

/**
 * Factory function to create CorePlaybackEngine
 */
export function createCorePlaybackEngine(
  stateManager?: StateManager,
  config?: CorePlaybackEngineConfig
): CorePlaybackEngine {
  return new CorePlaybackEngine(stateManager, config);
}
