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
  private originalTempo: number;
  private isInitialized = false;
  private pausedTime = 0;
  private isSeeking = false;
  private isRestarting = false;
  private _lastLogged = 0;

  // Transport event handlers
  private handleTransportStop = (): void => {
    // Don't process stop events during seek operations or restart
    if (this.isSeeking || this.isRestarting) {
      console.log(
        "[Transport.stop] Ignored - isSeeking:",
        this.isSeeking,
        "isRestarting:",
        this.isRestarting
      );
      return;
    }

    console.log(
      "[Transport.stop] Processing - isRepeating:",
      this.state.isRepeating,
      "isPlaying:",
      this.state.isPlaying
    );

    // Only update state if we're not in the middle of another operation
    if (!this.isSeeking && !this.isRestarting) {
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
    }
  };

  private handleTransportPause = (): void => {
    // Don't process pause events during seek operations
    if (this.isSeeking) {
      return;
    }

    this.state.isPlaying = false;
    this.stopSyncScheduler();
    this.pausedTime = Tone.getTransport().seconds;
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
    this.originalTempo = this.state.tempo;
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
    // Add event listeners
    Tone.getTransport().on("stop", this.handleTransportStop);
    Tone.getTransport().on("pause", this.handleTransportPause);
  }

  /**
   * Remove transport event callbacks
   */
  private removeTransportCallbacks(): void {
    Tone.getTransport().off("stop", this.handleTransportStop);
    Tone.getTransport().off("pause", this.handleTransportPause);
  }

  /**
   * Start playhead synchronization scheduler
   */
  private startSyncScheduler(): void {
    if (this.syncScheduler !== null) return;

    // Perform immediate update when starting scheduler
    const performUpdate = () => {
      if (this.state.isPlaying && !this.isSeeking) {
        // Get current transport time
        const transportTime = Tone.getTransport().seconds;

        // Map the transport time (which stretches/shrinks when BPM changes)
        // back to the original seconds timeline so that the piano roll stays
        // in sync regardless of tempo changes.
        const visualTime =
          (transportTime * this.state.tempo) / this.originalTempo;

        // Wrap around in repeat mode so time stays within [0, duration)
        const wrappedTime = this.state.isRepeating
          ? visualTime % this.state.duration
          : visualTime;

        this.state.currentTime = wrappedTime;

        // Update piano roll playhead
        this.pianoRoll.setTime(wrappedTime);

        // Check if we've reached the end (non-repeating mode)
        if (!this.state.isRepeating && wrappedTime >= this.state.duration) {
          this.pause();
        }

        if (Math.floor(visualTime) !== this._lastLogged) {
          console.log("[Sync]", { visualTime, transportTime });
          this._lastLogged = Math.floor(visualTime);
        }
      }
    };

    // Perform immediate update
    performUpdate();

    // Then set up interval for regular updates
    this.syncScheduler = window.setInterval(
      performUpdate,
      this.options.syncInterval
    );
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

    // ----------------------------------------------------------------------------------
    // If playback previously reached the end (no-repeat mode) we need to reset the
    // transport position so that a subsequent play() starts from the beginning.
    // Detect this by checking whether `pausedTime` is at/after the logical end of the
    // piece in *transport seconds* (which depends on the original tempo).
    // ----------------------------------------------------------------------------------
    const transportEnd =
      (this.state.duration * this.originalTempo) / this.state.tempo;

    // Small epsilon to account for floating-point rounding
    if (this.pausedTime >= transportEnd - 1e-3) {
      this.pausedTime = 0;
      // Also reset the underlying Tone.Transport position so that visuals/audio sync.
      Tone.getTransport().seconds = 0;

      // Cancel any lingering scheduled events to avoid double-triggers.
      if (this.part) {
        this.part.cancel();
      }
    }

    if (this.state.isPlaying) return;

    try {
      // Resume from paused position or start from beginning
      if (this.pausedTime > 0) {
        Tone.getTransport().seconds = this.pausedTime;
        // Part offset should be in transport time, which is pausedTime itself
        if (this.part && Tone.getTransport().state !== "started") {
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
    console.log("[AudioPlayer.restart:in]", {
      wasPlaying: this.state.isPlaying,
      currentState: { ...this.state },
      syncScheduler: this.syncScheduler,
      isSeeking: this.isSeeking,
    });

    const wasPlaying = this.state.isPlaying;

    // Set restart flag FIRST before any operations
    this.isRestarting = true;

    // Clear seek flag to prevent conflicts
    this.isSeeking = false;

    // Stop sync scheduler first
    this.stopSyncScheduler();

    // Cancel and stop part BEFORE transport operations
    if (this.part) {
      this.part.cancel();
      this.part.stop();
    }

    // Stop transport - this may trigger events but isRestarting flag will ignore them
    Tone.getTransport().stop();
    Tone.getTransport().seconds = 0;

    // Reset state
    this.state.currentTime = 0;
    this.pausedTime = 0;

    // Update visual immediately
    this.pianoRoll.setTime(0);

    // Now handle restart based on previous state
    if (wasPlaying) {
      // Was playing, so restart playback after a brief delay
      setTimeout(() => {
        // Only proceed if we're still in restart mode (not interrupted)
        if (this.isRestarting) {
          // Clear restart flag now that we're about to start
          this.isRestarting = false;

          // Start from beginning
          if (this.part) {
            this.part.start(0);
          }
          Tone.getTransport().start();

          // Update state AFTER transport is started
          this.state.isPlaying = true;

          // Start sync scheduler
          this.startSyncScheduler();

          // Force immediate visual update
          this.pianoRoll.setTime(0);
        }

        console.log("[AudioPlayer.restart:out]", {
          wasPlaying,
          currentState: { ...this.state },
          transportState: Tone.getTransport().state,
          transportSeconds: Tone.getTransport().seconds,
          syncScheduler: this.syncScheduler,
        });
      }, 50); // Small delay to ensure transport events are processed
    } else {
      // Was paused, just reset position without starting
      this.isRestarting = false;
      this.state.isPlaying = false;

      console.log("[AudioPlayer.restart:out]", {
        wasPlaying,
        currentState: { ...this.state },
        transportState: Tone.getTransport().state,
        transportSeconds: Tone.getTransport().seconds,
        syncScheduler: this.syncScheduler,
      });
    }
  }

  /**
   * Enable or disable repeat mode
   */
  public toggleRepeat(enabled: boolean): void {
    this.state.isRepeating = enabled;

    // Configure part looping so notes repeat
    if (this.part) {
      this.part.loop = enabled;
      this.part.loopEnd =
        (this.state.duration * this.originalTempo) / this.state.tempo;
    }

    // Configure global transport looping so timeline resets
    const transportLoopEnd =
      (this.state.duration * this.originalTempo) / this.state.tempo;
    const transport = Tone.getTransport();
    transport.loop = enabled;
    transport.loopStart = 0;
    transport.loopEnd = transportLoopEnd;
  }

  /**
   * Seek to specific time position
   */
  public seek(seconds: number): void {
    console.log("[AudioPlayer.seek:in]", {
      seconds,
      wasPlaying: this.state.isPlaying,
      currentState: this.state,
      transportState: Tone.getTransport().state,
    });

    // Set seeking flag FIRST to prevent transport event handlers from interfering
    this.isSeeking = true;

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

    // Cancel current part events before any transport manipulation
    if (this.part) {
      this.part.cancel();
    }

    // Update transport position
    Tone.getTransport().seconds = transportSeconds;

    // If we were playing, keep playing smoothly
    if (wasPlaying && Tone.getTransport().state === "started") {
      // Reschedule the part
      if (this.part) {
        const now = Tone.now();
        const transportOffset =
          (clampedVisual * this.originalTempo) / this.state.tempo;
        this.part.start(now, transportOffset);
      }
    } else if (wasPlaying && Tone.getTransport().state !== "started") {
      // Transport stopped unexpectedly, need to restart it
      if (this.part) {
        const transportOffset =
          (clampedVisual * this.originalTempo) / this.state.tempo;
        this.part.start(0, transportOffset);
      }
      Tone.getTransport().start();
    } else {
      // Not playing, just position update
      // No need to start transport
    }

    // Update piano roll immediately
    this.pianoRoll.setTime(clampedVisual);

    // Clear seeking flag after a delay to ensure all events have processed
    setTimeout(() => {
      this.isSeeking = false;
      // Ensure sync scheduler is running if we're playing
      if (this.state.isPlaying && this.syncScheduler === null) {
        this.startSyncScheduler();
      }
    }, 50); // Increased delay for better stability

    console.log("[AudioPlayer.seek:out]", {
      currentTime: this.state.currentTime,
      isPlaying: this.state.isPlaying,
      transportState: Tone.getTransport().state,
      isSeeking: this.isSeeking,
    });
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

    // Remove transport event callbacks
    this.removeTransportCallbacks();
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
