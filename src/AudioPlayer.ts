/**
 * Synchronized Audio Player for Piano Roll Visualization
 *
 * Provides audio playback controls that synchronize with PixiJS piano roll visualizer.
 * Uses Tone.js for precise timing and scheduling, ensuring ≤16ms drift between
 * audio playback and visual playhead position.
 */

import * as Tone from "tone";
import { NoteData } from "./types";

/**
 * Piano roll interface for playhead synchronization
 */
export interface PianoRollSync {
  /** Update the playhead position in seconds */
  setTime(time: number): void;
}

/**
 * Configuration options for the audio player
 */
export interface PlayerOptions {
  /** BPM for playback (default: 120) */
  tempo?: number;
  /** Volume level 0-1 (default: 0.7) */
  volume?: number;
  /** Whether to enable repeat/loop mode (default: false) */
  repeat?: boolean;
  /** Custom sound font URL for better audio quality */
  soundFont?: string;
  /** Update interval for playhead synchronization in ms (default: 16 for ~60fps) */
  syncInterval?: number;
}

/**
 * Audio player state
 */
export interface PlayerState {
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Whether repeat mode is enabled */
  isRepeating: boolean;
  /** Current playback position in seconds */
  currentTime: number;
  /** Total duration in seconds */
  duration: number;
  /** Current volume level 0-1 */
  volume: number;
  /** Current tempo in BPM */
  tempo: number;
}

/**
 * Audio player control interface
 */
export interface AudioPlayerControls {
  /** Start or resume playback */
  play(): Promise<void>;

  /** Pause playback */
  pause(): void;

  /** Stop and restart from beginning */
  restart(): void;

  /** Enable or disable repeat mode */
  toggleRepeat(enabled: boolean): void;

  /** Seek to specific time position */
  seek(seconds: number): void;

  /** Set playback volume */
  setVolume(volume: number): void;

  /** Set playback tempo */
  setTempo(bpm: number): void;

  /** Get current player state */
  getState(): PlayerState;

  /** Clean up resources */
  destroy(): void;
}

/**
 * Internal audio player implementation
 */
class AudioPlayer implements AudioPlayerControls {
  private notes: NoteData[];
  private pianoRoll: PianoRollSync;
  private options: Required<PlayerOptions>;

  // Tone.js components
  private sampler: Tone.Sampler | null = null;
  private part: Tone.Part | null = null;
  private syncScheduler: number | null = null;

  // Player state
  private state: PlayerState;
  /** Tempo at which the notes' "time" values were originally calculated (used for sync scaling) */
  private readonly originalTempo: number;
  private isInitialized = false;
  private pausedTime = 0;
  private isSeeking = false;

  constructor(
    notes: NoteData[],
    pianoRoll: PianoRollSync,
    options: PlayerOptions = {}
  ) {
    this.notes = notes;
    this.pianoRoll = pianoRoll;

    // Set default options
    this.options = {
      tempo: 120,
      volume: 0.7,
      repeat: false,
      soundFont: "", // Use default Tone.js sounds
      syncInterval: 16, // ~60fps
      ...options,
    };

    // Calculate duration from notes
    const duration =
      notes.length > 0
        ? Math.max(...notes.map((note) => note.time + note.duration))
        : 0;

    // Initialize state
    this.state = {
      isPlaying: false,
      isRepeating: this.options.repeat,
      currentTime: 0,
      duration,
      volume: this.options.volume,
      tempo: this.options.tempo,
    };

    // Store the original tempo used when converting MIDI ticks to seconds.
    // This is required so that we can map the current Tone.Transport time
    // (which changes when BPM changes) back onto the original seconds-based
    // coordinate system that the PianoRoll was rendered with.
    this.originalTempo = this.options.tempo;
  }

  /**
   * Initialize Tone.js components
   * Must be called after user interaction to satisfy autoplay policies
   */
  private async initializeAudio(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Start Tone.js context (required for autoplay policy)
      await Tone.start();

      // Set initial tempo
      Tone.getTransport().bpm.value = this.options.tempo;

      // Create sampler for note playback
      this.sampler = new Tone.Sampler({
        urls: {
          C4: "C4.mp3",
          "D#4": "Ds4.mp3",
          "F#4": "Fs4.mp3",
          A4: "A4.mp3",
        },
        release: 1,
        baseUrl:
          this.options.soundFont ||
          "https://tonejs.github.io/audio/salamander/",
        onload: () => {
          // Sampler loaded successfully
        },
      }).toDestination();

      // Wait for sampler to be loaded
      await Tone.loaded();

      // Set initial volume
      this.sampler.volume.value = Tone.gainToDb(this.options.volume);

      // Create Tone.Part for note scheduling
      this.setupNotePart();

      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize audio:", error);
      throw new Error(
        `Audio initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Set up Tone.Part for note scheduling
   */
  private setupNotePart(): void {
    if (!this.sampler) return;

    // Convert NoteData to Tone.js events
    const events = this.notes.map((note) => ({
      time: note.time,
      note: note.name,
      duration: note.duration,
      velocity: note.velocity,
    }));

    // Create scheduled part
    this.part = new Tone.Part((time: number, event: any) => {
      if (this.sampler) {
        this.sampler.triggerAttackRelease(
          event.note,
          event.duration,
          time,
          event.velocity
        );
      }
    }, events);

    // Configure loop behavior
    this.part.loop = this.state.isRepeating;
    // loopEnd should be in transport time
    this.part.loopEnd =
      (this.state.duration * this.originalTempo) / this.state.tempo;

    // Set up transport callbacks
    this.setupTransportCallbacks();
  }

  /**
   * Set up transport event callbacks
   */
  private setupTransportCallbacks(): void {
    // Handle transport stop (end of piece or manual stop)
    Tone.getTransport().on("stop", () => {
      // Don't process stop events during seek operations
      if (this.isSeeking) {
        return;
      }

      this.state.isPlaying = false;
      this.stopSyncScheduler();

      if (this.state.isRepeating) {
        // In repeat mode, restart automatically
        this.restart();
      } else {
        // Otherwise, reset to beginning
        this.state.currentTime = 0;
        this.pianoRoll.setTime(0);
      }
    });

    // Handle transport pause
    Tone.getTransport().on("pause", () => {
      // Don't process pause events during seek operations
      if (this.isSeeking) {
        return;
      }

      this.state.isPlaying = false;
      this.stopSyncScheduler();
      this.pausedTime = Tone.getTransport().seconds;
    });
  }

  /**
   * Start playhead synchronization scheduler
   */
  private startSyncScheduler(): void {
    if (this.syncScheduler !== null) return;

    this.syncScheduler = window.setInterval(() => {
      if (this.state.isPlaying && !this.isSeeking) {
        // Get current transport time
        const transportTime = Tone.getTransport().seconds;

        // Map the transport time (which stretches/shrinks when BPM changes)
        // back to the original seconds timeline so that the piano roll stays
        // in sync regardless of tempo changes.
        const visualTime =
          (transportTime * this.state.tempo) / this.originalTempo;

        this.state.currentTime = visualTime;

        // Update piano roll playhead
        this.pianoRoll.setTime(visualTime);

        // Check if we've reached the end (non-repeating mode)
        if (!this.state.isRepeating && visualTime >= this.state.duration) {
          this.pause();
        }
      }
    }, this.options.syncInterval);
  }

  /**
   * Stop playhead synchronization scheduler
   */
  private stopSyncScheduler(): void {
    if (this.syncScheduler !== null) {
      clearInterval(this.syncScheduler);
      this.syncScheduler = null;
    }
  }

  /**
   * Start or resume playback
   */
  public async play(): Promise<void> {
    // Initialize audio on first play (after user gesture)
    if (!this.isInitialized) {
      await this.initializeAudio();
    }

    if (this.state.isPlaying) return;

    try {
      // Resume from paused position or start from beginning
      if (this.pausedTime > 0) {
        Tone.getTransport().seconds = this.pausedTime;
        // Part offset should be in transport time, which is pausedTime itself
        if (this.part) {
          this.part.start(0, this.pausedTime);
        }
      } else {
        // Start from the beginning
        if (this.part) {
          this.part.start(0);
        }
      }

      Tone.getTransport().start();

      this.state.isPlaying = true;
      this.startSyncScheduler();
    } catch (error) {
      console.error("Failed to start playback:", error);
      throw new Error(
        `Playback failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Pause playback
   */
  public pause(): void {
    if (!this.state.isPlaying) return;

    Tone.getTransport().pause();
    this.state.isPlaying = false;
    this.pausedTime = Tone.getTransport().seconds;
    this.state.currentTime =
      (this.pausedTime * this.state.tempo) / this.originalTempo;
    this.stopSyncScheduler();

    // Update piano roll to freeze at current position
    this.pianoRoll.setTime(this.state.currentTime);
  }

  /**
   * Stop and restart from beginning
   */
  public restart(): void {
    // Stop transport and reset position
    Tone.getTransport().stop();
    Tone.getTransport().seconds = 0;

    this.state.isPlaying = false;
    this.state.currentTime = 0;
    this.pausedTime = 0;

    // Update piano roll
    this.pianoRoll.setTime(0);
    this.stopSyncScheduler();
  }

  /**
   * Enable or disable repeat mode
   */
  public toggleRepeat(enabled: boolean): void {
    this.state.isRepeating = enabled;

    if (this.part) {
      this.part.loop = enabled;
      // loopEnd should be in transport time
      this.part.loopEnd =
        (this.state.duration * this.originalTempo) / this.state.tempo;
    }
  }

  /**
   * Seek to specific time position
   */
  public seek(seconds: number): void {
    // Remember if we were playing before seek
    const wasPlaying = this.state.isPlaying;

    // Clamp to valid range in visual seconds
    const clampedVisual = Math.max(0, Math.min(seconds, this.state.duration));

    // Convert visual timeline seconds -> transport seconds
    const transportSeconds =
      (clampedVisual * this.originalTempo) / this.state.tempo;

    // Update state immediately
    this.state.currentTime = clampedVisual;
    this.pausedTime = transportSeconds;

    // If we were playing, keep playing smoothly
    if (wasPlaying) {
      // Set seeking flag to prevent sync scheduler and callback conflicts
      this.isSeeking = true;

      // Store current transport state
      const transportState = Tone.getTransport().state;

      // Cancel current part events
      if (this.part) {
        this.part.cancel();
      }

      // If transport is actually playing, we need to handle seek carefully
      if (transportState === "started") {
        // Update transport position first
        Tone.getTransport().seconds = transportSeconds;

        // Then immediately reschedule the part
        if (this.part) {
          const now = Tone.now();
          // Part offset should also be in transport time, not visual time
          const transportOffset =
            (clampedVisual * this.originalTempo) / this.state.tempo;
          this.part.start(now, transportOffset);
        }
      } else {
        // Transport might have stopped, restart everything
        Tone.getTransport().seconds = transportSeconds;
        if (this.part) {
          // Part offset should also be in transport time, not visual time
          const transportOffset =
            (clampedVisual * this.originalTempo) / this.state.tempo;
          this.part.start(0, transportOffset);
        }
        Tone.getTransport().start();
        this.state.isPlaying = true;
      }

      // Update piano roll immediately
      this.pianoRoll.setTime(clampedVisual);

      // Clear seeking flag and ensure sync scheduler is running
      setTimeout(() => {
        this.isSeeking = false;
        // Ensure sync scheduler is running after seek
        if (this.state.isPlaying && this.syncScheduler === null) {
          this.startSyncScheduler();
        }
      }, 20); // Slightly longer delay for stability
    } else {
      // Not playing, just update position
      Tone.getTransport().seconds = transportSeconds;

      // Update piano roll
      this.pianoRoll.setTime(clampedVisual);
    }
  }

  /**
   * Set playback volume
   */
  public setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.state.volume = clampedVolume;

    if (this.sampler) {
      this.sampler.volume.value = Tone.gainToDb(clampedVolume);
    }
  }

  /**
   * Set playback tempo
   */
  public setTempo(bpm: number): void {
    const clampedTempo = Math.max(30, Math.min(300, bpm));
    const oldTempo = this.state.tempo;
    this.state.tempo = clampedTempo;

    // If currently playing, we need to handle the tempo change carefully
    if (this.state.isPlaying) {
      // Set seeking flag temporarily to prevent sync conflicts
      this.isSeeking = true;

      // Get the current visual position before tempo change
      const currentVisualTime = this.state.currentTime;

      // Update transport tempo
      Tone.getTransport().bpm.value = clampedTempo;

      // Recalculate transport position to maintain visual sync
      // When tempo changes, the transport time needs to be adjusted
      const newTransportSeconds =
        (currentVisualTime * this.originalTempo) / clampedTempo;

      // Cancel and reschedule part at the adjusted position
      if (this.part) {
        this.part.cancel();
        const now = Tone.now();
        // Use the new transport seconds as offset
        this.part.start(now, newTransportSeconds);
      }

      // Update transport position to match
      Tone.getTransport().seconds = newTransportSeconds;

      // Clear seeking flag after a brief moment
      setTimeout(() => {
        this.isSeeking = false;
      }, 10);
    } else {
      // Not playing, just update the tempo
      Tone.getTransport().bpm.value = clampedTempo;

      // Also update pausedTime to maintain position when resuming
      if (this.pausedTime > 0) {
        const currentVisualTime =
          (this.pausedTime * oldTempo) / this.originalTempo;
        this.pausedTime =
          (currentVisualTime * this.originalTempo) / clampedTempo;
      }
    }
  }

  /**
   * Get current player state
   */
  public getState(): PlayerState {
    return { ...this.state };
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    // Stop playback
    this.pause();
    this.stopSyncScheduler();

    // Stop and clean up transport
    Tone.getTransport().stop();
    Tone.getTransport().cancel();

    // Dispose of Tone.js components
    if (this.part) {
      this.part.dispose();
      this.part = null;
    }

    if (this.sampler) {
      this.sampler.dispose();
      this.sampler = null;
    }

    this.isInitialized = false;
  }
}

/**
 * Factory function to create a synchronized audio player
 *
 * @param notes - Array of MIDI note data to play
 * @param pianoRoll - Piano roll instance for visual synchronization
 * @param options - Configuration options
 * @returns Audio player control interface
 *
 * @example
 * ```typescript
 * import { createAudioPlayer } from './AudioPlayer';
 * import { createPianoRoll } from './piano-roll';
 *
 * // Create piano roll
 * const pianoRoll = await createPianoRoll(container, notes);
 *
 * // Create synchronized audio player
 * const player = createAudioPlayer(notes, pianoRoll, {
 *   tempo: 120,
 *   volume: 0.8,
 *   repeat: false
 * });
 *
 * // Use player controls
 * await player.play();
 * player.pause();
 * player.seek(30); // Seek to 30 seconds
 * player.toggleRepeat(true);
 * ```
 */
export function createAudioPlayer(
  notes: NoteData[],
  pianoRoll: PianoRollSync,
  options: PlayerOptions = {}
): AudioPlayerControls {
  return new AudioPlayer(notes, pianoRoll, options);
}

/**
 * Check if audio context is supported and available
 */
export function isAudioSupported(): boolean {
  return (
    typeof AudioContext !== "undefined" ||
    typeof (window as any).webkitAudioContext !== "undefined"
  );
}

/**
 * Get audio context state for debugging
 */
export function getAudioContextState(): string {
  if (Tone.getContext().state) {
    return Tone.getContext().state;
  }
  return "unknown";
}
