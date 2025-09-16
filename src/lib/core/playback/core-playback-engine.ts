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
import { PlaybackValueUtils, ensureInitialized } from "./utils";

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
  updateInterval: 150, // Reduced to 150ms (6.7fps) to avoid conflicts with requestAnimationFrame while maintaining sync
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
   * Master volume property (0-1).
   * Getter reads from current audio player state,
   * setter delegates to setVolume() for consistent propagation.
   */
  public get masterVolume(): number {
    const state = this.audioPlayer?.getState();
    return state?.volume ?? this.config.defaultVolume;
  }

  public set masterVolume(volume: number) {
    this.setVolume(volume);
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
    console.log('[CorePlaybackEngine] updateAudio called with', notes.length, 'notes');
    
    // Calculate signature based on file IDs present in notes, not the actual notes
    // This prevents recreation when only mute states change
    const fileIds = new Set<string>();
    notes.forEach((note: any) => {
      if (note.fileId) {
        fileIds.add(note.fileId);
      }
    });
    // Signature based only on file IDs to avoid unnecessary audio player
    // recreation when note lists change due to UI transforms (tempo/loop/seek).
    const signature = Array.from(fileIds).sort().join(",");
    
    // console.log('[CorePlaybackEngine] File IDs found:', Array.from(fileIds));
    console.log('[CorePlaybackEngine] Current signature:', signature, 'Last signature:', this.lastAudioSignature);

    // Skip if file structure hasn't changed
    if (signature === this.lastAudioSignature && this.audioPlayer) {
      // console.log('[CorePlaybackEngine] Signature unchanged, skipping recreation');
      return;
    }

    // console.log('[CorePlaybackEngine] Creating audio player...');
    await this.recreateAudioPlayer(notes);
    this.lastAudioSignature = signature;
    // console.log('[CorePlaybackEngine] Audio player created successfully');
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
    this.audioPlayer = await createAudioPlayer(notes, {
      tempo: prevState?.tempo || this.config.defaultTempo,
      volume: prevState?.volume || this.config.defaultVolume,
      repeat: prevState?.isRepeating || false,
    }, pianoRollInstance);

    // Restore state
    if (prevState) {
      this.audioPlayer.setPan(prevState.pan);

      // IMPORTANT: Restore position BEFORE setting loop points
      // This ensures preservePosition works correctly in setLoopPoints
      if (prevState.currentTime >= 0) {
        this.audioPlayer.seek(prevState.currentTime, false);
      }

      // Now restore loop points with preservePosition=true
      // Since we've already restored the position, this will maintain it
      if (this.loopPoints.a !== null || this.loopPoints.b !== null) {
        this.audioPlayer.setLoopPoints(
          this.loopPoints.a,
          this.loopPoints.b,
          true
        );
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

    // Apply stored per-file pan values (if any)
    if (this.stateManager) {
      const panValues = this.stateManager.getFilePanValuesRef();
      Object.entries(panValues).forEach(([fid, p]) => {
        this.audioPlayer?.setFilePan(fid, p);
      });

      // Apply stored per-file mute states (if any)
      const muteStates = this.stateManager.getFileMuteStatesRef();
      Object.entries(muteStates).forEach(([fid, muted]) => {
        this.audioPlayer?.setFileMute(fid, muted);
      });
    }

    // Also check notes for mute metadata (for initial load)
    const fileMuteStates = new Map<string, boolean>();
    notes.forEach((note) => {
      if (note.fileId && !fileMuteStates.has(note.fileId)) {
        // Check if this file is marked as muted in any of the notes
        const isMuted = (note as unknown as { muted?: boolean }).muted === true;
        if (isMuted) {
          fileMuteStates.set(note.fileId, true);
        }
      }
    });

    // Apply detected mute states
    fileMuteStates.forEach((muted, fileId) => {
      this.audioPlayer?.setFileMute(fileId, muted);
      // Also persist to state manager
      if (this.stateManager) {
        this.stateManager.setFileMuteState(fileId, muted);
      }
    });

    // Sync with state manager if enabled
    if (this.config.enableStateSync && this.stateManager) {
      this.syncWithStateManager();
    }
  }

  /**
   * AudioPlayerContainer implementation
   */
  public async play(): Promise<void> {
    // console.log('[CorePlaybackEngine] Play called, audioPlayer exists:', !!this.audioPlayer);
    
    if (!this.audioPlayer) {
      console.error('[CorePlaybackEngine] audioPlayer is null, cannot play');
      return;
    }
    
    // Get state before playing to check if we're starting from the beginning
    const stateBefore = this.audioPlayer!.getState();
    // Rewind if at end and not repeating
    try {
      const atOrBeyondEnd = stateBefore.currentTime >= (stateBefore.duration ?? 0) - 0.005;
      const isLoopOff = !stateBefore.isRepeating;
      if (isLoopOff && atOrBeyondEnd) {
        this.audioPlayer.seek(0);
        // Reflect in piano roll immediately if available
        this.pianoRollManager?.setTime?.(0);
      }
    } catch {}
    const isStartingFromBeginning = stateBefore.currentTime === 0;

    await this.audioPlayer!.play();

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
        this.dispatchVisualUpdateFromState(state);
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
    const clampedVolume = PlaybackValueUtils.clampVolume(volume);
    this.audioPlayer?.setVolume(clampedVolume);

    if (this.config.enableStateSync && this.stateManager) {
      this.stateManager.updatePlaybackState({ volume: clampedVolume });
    }
  }

  public setTempo(bpm: number): void {
    const clampedTempo = PlaybackValueUtils.clampTempo(
      bpm,
      this.config.minTempo,
      this.config.maxTempo
    );
    this.audioPlayer?.setTempo(clampedTempo);
  }

  public setLoopPoints(start: number | null, end: number | null, preservePosition: boolean = false): void {
    this.loopPoints = { a: start, b: end };
    this.audioPlayer?.setLoopPoints(start, end, preservePosition);

    if (this.config.enableStateSync && this.stateManager) {
      this.stateManager.setLoopPoints(start, end);
    }
  }

  public setPan(pan: number): void {
    this.audioPlayer?.setPan(pan);
  }

  /**
   * Set pan for a specific file track.
   */
  public setFilePan(fileId: string, pan: number): void {
    this.audioPlayer?.setFilePan(fileId, pan);

    // Persist in state manager so the value survives player recreation
    if (this.config.enableStateSync && this.stateManager) {
      this.stateManager.setFilePanValue(fileId, pan);
    }
  }

  /**
   * Set mute state for a specific file track.
   */
  public setFileMute(fileId: string, mute: boolean): void {
    this.audioPlayer?.setFileMute(fileId, mute);

    // Persist in state manager so the value survives player recreation
    if (this.config.enableStateSync && this.stateManager) {
      this.stateManager.setFileMuteState(fileId, mute);
    }
  }

  /**
   * Set playback rate as percentage (10-200, 100 = normal speed)
   */
  public setPlaybackRate(rate: number): void {
    this.audioPlayer?.setPlaybackRate(rate);
    // Immediately notify UI so time-display/seek-bar reflect new time scale
    const state = this.audioPlayer?.getState();
    if (state) {
      this.dispatchVisualUpdateFromState(state);
    }
  }

  /**
   * Set volume for a specific MIDI file
   */
  public setFileVolume(fileId: string, volume: number): void {
    this.audioPlayer?.setFileVolume(fileId, volume);
  }

  /**
   * Set volume for a specific WAV file
   */
  public setWavVolume(fileId: string, volume: number): void {
    this.audioPlayer?.setWavVolume(fileId, volume);
  }

  /**
   * Refresh WAV/audio players from registry (for mute state updates)
   */
  public refreshAudioPlayers(): void {
    this.audioPlayer?.refreshAudioPlayers?.();
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
        // New unified state management fields
        masterVolume: this.config.defaultVolume,
        loopMode: 'off' as const,
        markerA: null,
        markerB: null,
        nowTime: 0,
        totalTime: 0,
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

    // Simple signature based on file IDs and note count
    // This prevents recreation on mute/unmute
    const fileIds = new Set<string>();
    notes.forEach((note: any) => {
      if (note.fileId) {
        fileIds.add(note.fileId);
      }
    });

    return Array.from(fileIds).sort().join(",") + ":" + notes.length;
  }

  /**
   * Dispatch a visual update event to all registered callbacks.
   */
  private dispatchVisualUpdate(params: VisualUpdateParams): void {
    this.visualUpdateCallbacks.forEach((callback) => {
      try {
        callback(params);
      } catch (error) {
        console.error("Error in visual update callback:", error);
      }
    });
  }

  /**
   * Helper: build `VisualUpdateParams` from an `AudioPlayerState` and dispatch.
   */
  private dispatchVisualUpdateFromState(state: AudioPlayerState): void {
    const params: VisualUpdateParams = {
      currentTime: state.currentTime,
      duration: state.duration,
      isPlaying: state.isPlaying,
      volume: state.volume,
      tempo: state.tempo,
      pan: state.pan,
    };
    this.dispatchVisualUpdate(params);
  }

  private startUpdateLoop(): void {
    if (this.updateLoopId !== null) return;

    const performUpdate = () => {
      if (!this.audioPlayer || this.seeking) return;

      const state = this.audioPlayer.getState();

      // Keep piano roll playhead in sync with transport at all times
      if (this.pianoRollManager) {
        // Avoid redundant calls if already at the same time - PianoRoll internally throttles renders anyway.
        this.pianoRollManager.setTime(state.currentTime);
      }

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
      this.dispatchVisualUpdateFromState(state);
    };

    // Immediate update
    performUpdate();

    // Start interval with optimized frequency
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
let __activeCorePlaybackEngine: CorePlaybackEngine | null = null;
export function createCorePlaybackEngine(
  stateManager?: StateManager,
  config?: CorePlaybackEngineConfig
): CorePlaybackEngine {
  // Replace policy: if an active engine exists, destroy it safely and replace
  if (__activeCorePlaybackEngine) {
    try {
      __activeCorePlaybackEngine.destroy();
    } catch {}
    __activeCorePlaybackEngine = null;
  }

  const engine = new CorePlaybackEngine(stateManager, config);
  __activeCorePlaybackEngine = engine;
  return engine;
}
