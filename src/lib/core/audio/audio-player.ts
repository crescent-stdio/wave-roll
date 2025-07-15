/**
 * Synchronized Audio Player for Piano Roll Visualization
 *
 * Provides audio playback controls that synchronize with PixiJS piano roll visualizer.
 * Uses Tone.js for precise timing and scheduling, ensuring ≤16ms drift between
 * audio playback and visual playhead position.
 */

import * as Tone from "tone";
import { NoteData } from "@/lib/midi/types";
import { clamp } from "../utils";

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
export interface AudioPlayerState {
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
  /** Reference tempo used when MIDI was decoded (immutable baseline) */
  originalTempo: number;
  /** Current stereo pan value (-1 left, 0 center, 1 right) */
  pan: number;
}

/**
 * Audio player control interface
 */
export interface AudioPlayerContainer {
  /** Start or resume playback */
  play(): Promise<void>;

  /** Pause playback */
  pause(): void;

  /** Stop and restart from beginning */
  restart(): void;

  /** Enable or disable repeat mode */
  toggleRepeat(enabled: boolean): void;

  /** Seek to specific time position */
  seek(seconds: number, updateVisual?: boolean): void;

  /** Set playback volume */
  setVolume(volume: number): void;

  /** Set playback tempo */
  setTempo(bpm: number): void;

  /**
   * Set custom A-B loop points (in seconds).
   * Passing `null` for both parameters clears the loop.
   * If only `start` is provided, the loop will extend to the end of the piece.
   */
  setLoopPoints(start: number | null, end: number | null): void;

  /** Get current player state */
  getState(): AudioPlayerState;

  /** Clean up resources */
  destroy(): void;

  /** Set stereo pan value (-1 left, 0 center, 1 right) */
  setPan(pan: number): void;

  // options: PlayerOptions;
}

/**
 * Internal state for managing async operations
 */
export interface OperationState {
  isSeeking: boolean;
  isRestarting: boolean;
  pendingSeek: number | null;
  lastLoopJumpTime: number;
}

/**
 * Internal audio player implementation
 */
export class AudioPlayer implements AudioPlayerContainer {
  private notes: NoteData[];
  private pianoRoll: PianoRollSync;
  public options: Required<PlayerOptions>;

  // Tone.js components
  private sampler: Tone.Sampler | null = null;
  private part: Tone.Part | null = null;
  private syncScheduler: number | null = null;
  private panner: Tone.Panner | null = null;

  /** Token that identifies the *current* sync-scheduler. Incrementing this
   *  value invalidates callbacks created by any previous scheduler. */
  private _schedulerToken = 0;

  // Player state
  private state: AudioPlayerState;
  /** Tempo at which the notes' "time" values were originally calculated (used for sync scaling) */
  private originalTempo: number;
  private isInitialized = false;
  private pausedTime = 0;
  private _lastLogged = 0;
  private _loopStartVisual: number | null = null;
  private _loopEndVisual: number | null = null;

  // Refactored operation state management
  private operationState: OperationState = {
    isSeeking: false,
    isRestarting: false,
    pendingSeek: null,
    lastLoopJumpTime: 0,
  };

  /** Counts how many Transport loop iterations have occurred (debug only) */
  private _loopCounter = 0;

  /** Prevent concurrent play() invocations (e.g., rapid Space presses) */
  private _playLock = false;

  /** Wall-clock timestamp (ms) of the most recent seek() call. */
  private _lastSeekTimestamp = 0;

  // Transport event handlers
  private handleTransportStop = (): void => {
    // Suppress spurious stop events that sometimes fire shortly after a
    // programmatic seek.  These events occur while Tone.Transport is busy
    // rescheduling the timeline and would incorrectly toggle the UI state
    // to "stopped", causing visible flicker of the playhead.  Ignore any
    // stop that happens within a short grace period after the most recent
    // seek.  In practice Tone.Transport may emit its queued "stop" event up
    // to a few hundred milliseconds after we finished repositioning the
    // timeline, so a slightly longer window (~400 ms) avoids the flicker of
    // the UI jumping back to 0 and immediately forward to the new position.
    // (Measured empirically across Chrome/Safari/Firefox.)
    // Increase suppression window to 3000 ms. In complex scores Tone.Transport can emit
    // deferred "stop" callbacks up to ~2.5 s after a heavy seek. Extending the guard
    // further prevents the UI from flickering back to 0 s when that stale event fires.
    const SEEK_SUPPRESS_MS = 3000; // was 1200 - extended to better cover slow devices/browsers
    if (Date.now() - this._lastSeekTimestamp < SEEK_SUPPRESS_MS) {
      return;
    }

    // Ignore any "stop" callback while the transport still reports itself
    // as *running*.  Tone.js occasionally emits a queued "stop" event from
    // an obsolete timeline even though `Transport.state` is "started".  Such
    // events do not correspond to an actual halt in playback and would
    // erroneously flip `isPlaying` to false, causing a visible flicker.
    if (Tone.getTransport().state !== "stopped") {
      return;
    }

    console.log("[Transport.stop] fired", {
      transportState: Tone.getTransport().state,
      transportSec: Tone.getTransport().seconds.toFixed(3),
      visualSec: (
        (Tone.getTransport().seconds * this.state.tempo) /
        this.originalTempo
      ).toFixed(3),
      currentTime: this.state.currentTime.toFixed(3),
      isSeeking: this.operationState.isSeeking,
      isRestarting: this.operationState.isRestarting,
    });

    /* --------------------------------------------------------------
     * Guard #3 - spurious stop events that do **not** correspond to
     * the player’s current visual position.
     * --------------------------------------------------------------
     * After a seek() / restart() Tone.Transport may emit a queued
     * "stop" from the previous timeline even **seconds** after the
     * new schedule is in place.  We detect such stale events by
     * comparing the transport’s position (converted to visual time)
     * with the internally tracked currentTime.  If they differ by
     * more than 1 second we know the event is outdated and therefore
     * ignore it to avoid the UI jumping back to 0 sec.
     * -------------------------------------------------------------- */
    const transportSec = Tone.getTransport().seconds;
    const visualSec = (transportSec * this.state.tempo) / this.originalTempo;
    if (Math.abs(visualSec - this.state.currentTime) > 1) {
      // Likely a leftover event from the old timeline - discard.
      // console.warn("[Transport.stop] Ignored - stale event", {
      //   transportSec: transportSec.toFixed(3),
      //   visualSec: visualSec.toFixed(3),
      //   currentTime: this.state.currentTime.toFixed(3),
      // });
      return;
    }

    // Ignore stop when seeking or restarting
    if (this.operationState.isSeeking || this.operationState.isRestarting) {
      // console.log("[Transport.stop] Ignored - operation in progress", {
      //   isSeeking: this.operationState.isSeeking,
      //   isRestarting: this.operationState.isRestarting,
      // });
      return;
    }

    // If a custom A-B loop is active, we manage looping manually via seek()
    if (this._loopStartVisual !== null && this._loopEndVisual !== null) {
      return;
    }

    // console.log(
    //   "[Transport.stop] Processing - isRepeating:",
    //   this.state.isRepeating,
    //   "isPlaying:",
    //   this.state.isPlaying
    // );

    // Only update state if we're not in the middle of another operation
    if (!this.operationState.isSeeking && !this.operationState.isRestarting) {
      this.state.isPlaying = false;
      this.stopSyncScheduler();

      // When repeat mode (global or A-B) is active we rely exclusively on
      // Transport.loop to wrap the timeline, so do not reset the playhead.
      //
      // For non-repeat playback we previously reset `currentTime` to 0 for *any*
      // Transport.stop.  However, deferred "stop" events that fire shortly
      // after a seek() caused the UI to flicker back to 0 s before jumping to
      // the requested position.  We now reset only when the stop event really
      // corresponds to reaching (or overshooting) the end of the piece.
      if (!this.state.isRepeating) {
        const TOLERANCE_SEC = 0.1; // 100 ms cushion for FP rounding
        const atEnd =
          this.state.currentTime >= this.state.duration - TOLERANCE_SEC;

        if (atEnd) {
          this.state.currentTime = 0;
          this.pianoRoll.setTime(0);
        }
      }
    }
  };

  private handleTransportPause = (): void => {
    // Don't process pause events during seek operations
    if (this.operationState.isSeeking) {
      return;
    }

    this.state.isPlaying = false;
    this.stopSyncScheduler();
    this.pausedTime = Tone.getTransport().seconds;
  };

  /**
   * When Transport.loop=true (global repeat or A-B repeat)
   * Tone.Transport emits a "loop" event at the moment the playhead
   * wraps from loopEnd back to loopStart. Since we disabled Part.loop
   * to prevent double-scheduling, we have to *manually* retrigger the
   * Part so that notes are heard on each pass.
   */
  private handleTransportLoop = (): void => {
    console.warn("[LoopEvent]", {
      iteration: this._loopCounter,
      transportSec: Tone.getTransport().seconds.toFixed(3),
      loopStart: this._loopStartVisual,
      loopEnd: this._loopEndVisual,
      currentVisual: this.state.currentTime.toFixed(3),
    });
    if (!this.part) {
      return;
    }

    this._loopCounter += 1;
    const transport = Tone.getTransport();

    // console.log("[Loop]", {
    //   iteration: this._loopCounter,
    //   transportSeconds: transport.seconds.toFixed(3),
    //   loopStart: transport.loopStart,
    //   loopEnd: transport.loopEnd,
    // });

    // Cancel any notes which were scheduled for the previous cycle.
    // Using a very small delay prevents race conditions where cancel/stop
    // occurs at the exact same AudioContext time as the new scheduling.
    const NOW = "+0";
    this.part.stop(NOW);
    this.part.cancel(NOW);

    // Restart the Part at the very beginning of its window (offset 0).
    this.part.start(NOW, 0);

    // Also synchronise the visual playhead immediately.
    const visualStart =
      this._loopStartVisual !== null ? this._loopStartVisual : 0;
    this.scheduleVisualUpdate(() => this.pianoRoll.setTime(visualStart));

    // Keep internal state aligned.
    this.state.currentTime = visualStart;
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
      originalTempo: this.options.tempo,
      pan: 0,
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

      // Create stereo panner (center by default) -> destination
      this.panner = new Tone.Panner(0).toDestination();

      // Create sampler for note playback and route through panner
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
      }).connect(this.panner);

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
  private setupNotePart(
    loopStartVisual?: number,
    loopEndVisual?: number
  ): void {
    if (!this.sampler) return;

    // Dispose of existing part if it exists
    if (this.part) {
      this.part.dispose();
    }

    // Create events, optionally windowed for A-B looping
    const events = this.notes
      .filter((note) => {
        if (
          loopStartVisual !== undefined &&
          loopEndVisual !== undefined &&
          loopStartVisual !== null &&
          loopEndVisual !== null
        ) {
          // Keep any note whose *onset* occurs inside the loop window.
          // This allows very short A-B regions (\<= 한 음 길이) to still trigger sound.
          const noteStart = note.time;
          return noteStart >= loopStartVisual && noteStart < loopEndVisual;
        }
        return true;
      })
      .map((note) => {
        // Clamp duration so sustained notes don\'t bleed into the next cycle.
        let duration = note.duration;
        let onset = note.time;

        if (
          loopStartVisual !== undefined &&
          loopEndVisual !== undefined &&
          loopStartVisual !== null &&
          loopEndVisual !== null
        ) {
          const maxTail = loopEndVisual - onset;
          duration = Math.min(duration, maxTail);
        }

        const relativeTime =
          loopStartVisual !== undefined && loopStartVisual !== null
            ? onset - loopStartVisual
            : onset;

        return {
          time: relativeTime,
          note: note.name,
          duration,
          velocity: note.velocity,
        };
      });

    this.part = new Tone.Part((time: number, event: any) => {
      if (!this.sampler) {
        return;
      }
      this.sampler.triggerAttackRelease(
        event.note,
        event.duration,
        time,
        event.velocity
      );
      // Debug: log every note that is actually triggered so we can verify
      // that audio playback is occurring even if speakers are muted.
      // console.log("[Note]", {
      //   note: event.note,
      //   velocity: event.velocity,
      //   duration: event.duration,
      //   time: time.toFixed(3),
      // });
    }, events);

    this.part.humanize = false;
    this.part.loop = false;

    // Set up transport callbacks
    this.setupTransportCallbacks();
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
   * Start playhead synchronization scheduler
   */
  private startSyncScheduler(): void {
    // Prevent duplicate schedulers
    if (this.syncScheduler !== null) return;

    // Any previously queued callbacks belong to an old scheduler instance.
    // Incrementing the token lets those callbacks detect that they are
    // obsolete and exit early, eliminating one-off drift spikes and UI
    // flicker that occurred right after seek() / restart().
    const token = ++this._schedulerToken;

    // Force initial sync to current position (usually 0:00 when starting fresh)
    const initialSync = () => {
      const transport = Tone.getTransport();
      const transportTime = transport.seconds;
      const visualTime =
        (transportTime * this.state.tempo) / this.originalTempo;

      /*--------------------------------------------------------------
       * Prevent the playhead from jumping **backwards** when a new
       * sync-scheduler starts immediately after a seek().  In some
       * browsers `transport.seconds` still reports the *pre-seek*
       * time for a few milliseconds after we call
       * `Transport.seconds = newPos; Transport.start()`.  If we
       * applied that stale value here, the UI would flash at the old
       * position (e.g. 1.4 s) before catching up to >30 s, causing the
       * flicker reported by users.
       *
       * We therefore ignore any initial visualTime that is more than
       * 1 s **behind** the already-known `state.currentTime`.
       *--------------------------------------------------------------*/
      const TOLERANCE_SEC = 1;
      if (visualTime < this.state.currentTime - TOLERANCE_SEC) {
        // Stale - keep existing position and let the first performUpdate()
        // correct things once Transport.seconds has settled.
        return;
      }

      // Update state and visual
      this.state.currentTime = visualTime;
      this.pianoRoll.setTime(visualTime);

      // Initial log
      // console.log("[Sync] Initial:", { visualTime, transportTime });
    };

    // Perform initial sync immediately
    initialSync();

    const performUpdate = () => {
      // Ignore callbacks from an outdated scheduler that was stopped while
      // its final invocation was already queued in the event loop.
      if (token !== this._schedulerToken) {
        return;
      }
      if (!this.state.isPlaying || this.operationState.isSeeking) {
        return;
      }

      const transport = Tone.getTransport();
      // Skip update if transport is not actually running yet
      if (transport.state !== "started") {
        return;
      }

      const transportTime = transport.seconds;

      const visualTime =
        (transportTime * this.state.tempo) / this.originalTempo;
      // Debug logging removed to reduce console spam
      // console.log("[SyncScheduler]", { visualTime, transportTime });

      // const drift = (visualTime - this.state.currentTime) * 1000; // ms
      // if (Math.abs(drift) > 5) {
      //   // greater than 5ms
      //   console.warn("[Drift]", {
      //     transportTime,
      //     visualTime,
      //     driftMs: drift.toFixed(2),
      //   });
      // }
      // Sync internal state and visual playhead
      this.state.currentTime = visualTime;
      this.pianoRoll.setTime(visualTime);

      // Auto-pause when playback ends and repeat is off
      if (!this.state.isRepeating && visualTime >= this.state.duration) {
        this.pause();
      }

      // Throttled debug log (1 Hz) - disabled to reduce console spam
      // if (Math.floor(visualTime) !== this._lastLogged) {
      //   console.log("[Sync]", { visualTime, transportTime });
      //   this._lastLogged = Math.floor(visualTime);
      // }
    };

    // Start regular interval updates
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
      // Invalidate any callbacks that might still fire after we cleared the
      // interval.  Those callbacks will compare their captured token against
      // the *current* token and return immediately.
      this._schedulerToken += 1;
    }
  }

  /**
   * Schedule a callback using Tone.js Draw API for visual updates
   */
  private scheduleVisualUpdate(callback: () => void): void {
    // If Tone.js hasn't been started yet, execute immediately so UI updates
    // when user interacts with seek bar before first playback.
    if (!this.isInitialized) {
      callback();
      return;
    }

    // Otherwise use Tone.Draw for audio-synced visual updates.
    Tone.Draw.schedule(callback, Tone.now());
  }

  /**
   * Start or resume playback
   */
  public async play(): Promise<void> {
    // console.log(
    //   "[AudioPlayer.play] enter. transport:",
    //   Tone.getTransport().state
    // );
    // Ignore if a play request is already in flight
    if (this._playLock) {
      // console.log(
      //   "[AudioPlayer.play] Request ignored - play already in progress"
      // );
      return;
    }
    this._playLock = true;

    // console.log(
    //   "[AudioPlayer.play:in]",
    //   "isInitialized:",
    //   this.isInitialized,
    //   "isPlaying:",
    //   this.state.isPlaying,
    //   "transportState:",
    //   Tone.getTransport().state
    // );
    // Initialize audio on first play (after user gesture)
    if (!this.isInitialized) {
      await this.initializeAudio();
    }

    const transport = Tone.getTransport();

    // Check actual Transport state
    if (transport.state === "started") {
      // Already playing, ensure internal state is synced
      this.state.isPlaying = true;
      return;
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
      transport.seconds = 0;

      // Cancel any lingering scheduled events to avoid double-triggers.
      if (this.part) {
        this.part.cancel();
      }
    }

    /**
     * ------------------------------------------------------------------
     * Ensure `pausedTime` is always in sync with the last visual position.
     * When the user drags the seek-bar while paused, we update
     * `state.currentTime` and `Tone.Transport.seconds`, but in rare cases
     * (e.g. if a click/drag was ignored or queued) `pausedTime` might still
     * reference the pre-seek position.  This guard realigns `pausedTime`
     * with the authoritative `state.currentTime` so playback resumes from
     * the correct point.
     * ------------------------------------------------------------------
     */
    const expectedTransportSeconds =
      (this.state.currentTime * this.originalTempo) / this.state.tempo;
    if (Math.abs(this.pausedTime - expectedTransportSeconds) > 1e-3) {
      this.pausedTime = expectedTransportSeconds;
      transport.seconds = expectedTransportSeconds;
    }

    if (this.state.isPlaying) return;

    try {
      // Resume from paused position or start from beginning
      if (this.pausedTime > 0) {
        Tone.getTransport().seconds = this.pausedTime;
        // When a custom A-B loop is active the Part's events are stored *relative* to
        // the loop's visual `start` (i.e. the first note in the loop has time = 0).
        // Therefore we must convert the absolute `pausedTime` (in transport seconds)
        // into an *offset inside the loop window* before starting the Part; otherwise
        // we end up starting the Part midway through its event list which causes the
        // very first loop iteration to play silently.

        if (this.part && Tone.getTransport().state !== "started") {
          // Ensure Part is stopped before starting to avoid duplicate scheduling
          this.part.stop();

          const offsetForPart =
            this._loopStartVisual !== null && this._loopEndVisual !== null
              ? // Offset is the visual distance from loop start
                Math.max(0, this.state.currentTime - this._loopStartVisual)
              : // No custom loop - use pausedTime (transport seconds)
                this.pausedTime;

          this.part.start("+0", offsetForPart);
        }
      } else {
        // Start from the beginning - explicitly set transport to 0
        Tone.getTransport().seconds = 0;
        this.state.currentTime = 0;

        // Immediately update piano roll to 0 position
        this.pianoRoll.setTime(0);

        if (this.part) {
          // Ensure part is stopped before starting
          this.part.stop();
          // Using non-null assertion to satisfy TS and schedule immediately at audio context time
          (this.part as Tone.Part).start("+0", 0);
        }
      }

      Tone.getTransport().start();

      this.state.isPlaying = true;
      this.startSyncScheduler();

      // console.log("[AudioPlayer.play:out]", {
      //   isPlaying: this.state.isPlaying,
      //   transportState: Tone.getTransport().state,
      // });
    } catch (error) {
      console.error("Failed to start playback:", error);
      throw new Error(
        `Playback failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      // Ensure lock is released even if an error occurs
      this._playLock = false;
    }
  }

  /**
   * Pause playback
   */
  public pause(): void {
    // Check actual Transport state instead of relying on internal state
    const transport = Tone.getTransport();

    // If transport is not playing, nothing to pause
    if (transport.state !== "started") {
      // Ensure internal state is synced
      this.state.isPlaying = false;
      return;
    }

    // Capture the pause time before stopping transport
    this.pausedTime = transport.seconds;
    this.state.currentTime =
      (this.pausedTime * this.state.tempo) / this.originalTempo;

    // Now pause the transport
    transport.pause();
    this.state.isPlaying = false;

    // Stop the sync scheduler after state is updated
    this.stopSyncScheduler();

    // Update piano roll to freeze at current position
    this.pianoRoll.setTime(this.state.currentTime);
  }

  /**
   * Stop and restart from beginning
   */
  public restart(): void {
    const wasPlaying = this.state.isPlaying;

    // Prevent concurrent restarts
    if (this.operationState.isRestarting) return;
    this.operationState.isRestarting = true;

    // Stop synchronization immediately
    this.stopSyncScheduler();

    // Immediately stop and cancel existing notes
    if (this.part) {
      this.part.stop("+0");
      this.part.cancel();
      this.part.dispose();
    }

    // Remove any lingering events that the previous Part may have left in the
    // Tone.Transport schedule. This prevents notes beyond the new loop window
    // from firing after A-B boundaries are updated.
    Tone.getTransport().cancel();

    const transport = Tone.getTransport();

    // Determine where the restart should jump to. If an A-B loop is active,
    // restart from the loop's start (point A). Otherwise from the very
    // beginning of the piece.
    const visualStart =
      this._loopStartVisual !== null ? this._loopStartVisual : 0;
    const transportStart =
      (visualStart * this.originalTempo) / this.state.tempo;

    // Fully reset transport state immediately
    transport.stop();
    transport.cancel();
    transport.seconds = transportStart;
    transport.position = transportStart; // ensure Bars:Beats also updated

    // Reset internal states immediately
    this.state.currentTime = visualStart;
    this.pausedTime = transportStart;
    // Avoid premature visual jump: update playhead immediately only when playback will remain stopped
    if (!wasPlaying) {
      this.pianoRoll.setTime(visualStart);
    }

    if (wasPlaying) {
      // A-B 창이 있으면 그 범위로, 없으면 전체로
      if (this._loopStartVisual !== null && this._loopEndVisual !== null) {
        this.setupNotePart(this._loopStartVisual, this._loopEndVisual);
      } else {
        this.setupNotePart();
      }

      // Start the transport a few milliseconds in the future to guarantee scheduling
      const RESTART_DELAY = 0.05; // 50 ms buffer improves reliability across browsers
      const startTime = Tone.now() + RESTART_DELAY;

      // Queue Part to begin exactly when the transport resumes.
      // If loop active, Part events are relative to loopStart (offset 0).
      if (this.part) {
        // Align Part start with the exact Transport `startTime` so that the
        // first note is rendered in the same audio frame in which the
        // Transport begins playback. This prevents the ~50 ms latency that
        // was noticeable right after invoking `restart()`.
        this.part.start(startTime, 0);
      }

      // Start the global transport at the calculated AudioContext `startTime`.
      transport.start(startTime, transportStart);

      // Immediately resume sync tracking once transport actually starts
      setTimeout(() => {
        this.startSyncScheduler();
        this.state.isPlaying = true;
        this.operationState.isRestarting = false;
        // Sync visual playhead immediately after transport starts
        this.scheduleVisualUpdate(() => this.pianoRoll.setTime(visualStart));
      }, RESTART_DELAY * 1000);
    } else {
      this.state.isPlaying = false;
      this.operationState.isRestarting = false;
    }
  }

  /**
   * Enable or disable repeat mode
   */
  public toggleRepeat(enabled: boolean): void {
    this.state.isRepeating = enabled;

    if (!enabled) {
      // Clear custom loop window when global repeat is turned off
      this._loopStartVisual = null;
      this._loopEndVisual = null;
    }

    // We rely exclusively on Tone.Transport looping to repeat playback. Using
    // both Part.loop **and** Transport.loop can cause notes to be scheduled
    // twice (once for each mechanism) which results in either phasing artefacts
    // or missing notes after the first pass of an A-B loop. Therefore, keep
    // the Part non-looping here and let the Transport handle the repetition.
    if (this.part) {
      this.part.loop = false;
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
  public seek(inputSeconds: number, updateVisual: boolean = true): void {
    // Record this seek so that we can filter out any stray Transport.stop
    // callbacks emitted during the re-scheduling that immediately follows.
    this._lastSeekTimestamp = Date.now();

    // ------------------------------------------------------------------
    // Temporarily detach Transport callbacks so that any implicit
    // "stop" / "pause" events fired by Tone.Transport while we are
    // scrubbing do NOT propagate to `handleTransportStop` /
    // `handleTransportPause`. Those callbacks would incorrectly set
    // `state.isPlaying = false` and halt the sync-scheduler, leading to
    // visible jitter (progress-bar + piano-roll) and audible glitches
    // immediately after a seek.
    // ------------------------------------------------------------------
    this.removeTransportCallbacks();

    /* ------------------------------------------------------------------
     * Tone.Transport jumps back to `loopStart` immediately when its
     * position equals or exceeds `loopEnd`.  If the user seeks **exactly**
     * to B (loopEnd) while an A-B loop is active, the transport therefore
     * wraps to A, causing the progress-bar to flash at A and then update
     * again once the scheduler catches up.  To prevent this visual glitch
     * we snap the requested seek target a few milliseconds *before* B so
     * that playback resumes just inside the loop window.
     * ------------------------------------------------------------------ */
    let seconds = inputSeconds;
    if (
      this._loopEndVisual !== null &&
      this._loopStartVisual !== null &&
      seconds >= this._loopEndVisual
    ) {
      // Use a slightly larger cushion so that the transport does not
      // immediately hit `loopEnd` and emit a "loop" event which would
      // momentarily reset the playhead to `loopStart`.  A 50 ms margin has
      // proven reliable across browsers and devices while remaining
      // imperceptible to users.
      const EPSILON = 0.05; // 50 ms cushion
      seconds = Math.max(this._loopStartVisual, this._loopEndVisual - EPSILON);
    }

    console.log(
      "[AudioPlayer.seek] requested to",
      this.state.currentTime.toFixed(3),
      "s ->",
      seconds.toFixed(3),
      "s"
    );

    // If a seek is already in progress, queue this request to run afterwards.
    if (this.operationState.isSeeking) {
      this.operationState.pendingSeek = seconds;
      return;
    }

    this.operationState.isSeeking = true;

    // Detect the *actual* transport state instead of relying on `state.isPlaying`,
    // which might be temporarily out-of-sync if a Transport "stop" event fired
    // during an earlier internal operation (e.g. when repositioning the playhead).
    const wasPlaying = Tone.getTransport().state === "started";

    // Keep the internal `state.isPlaying` aligned with the live transport status so
    // that any downstream checks (e.g. restart of the sync-scheduler) use up-to-date
    // information.
    this.state.isPlaying = wasPlaying;

    // Clamp visual position within valid bounds
    const clampedVisual = clamp(seconds, 0, this.state.duration);
    const transportSeconds =
      (clampedVisual * this.originalTempo) / this.state.tempo;

    // Immediately update internal state and paused position
    this.state.currentTime = clampedVisual;
    this.pausedTime = transportSeconds;

    console.log("[AP.seek] mid", {
      transportSec: transportSeconds.toFixed(3),
      visualSec: clampedVisual.toFixed(3),
      pausedTime: this.pausedTime.toFixed(3),
      currentTime: this.state.currentTime.toFixed(3),
      isSeeking: this.operationState.isSeeking,
    });
    if (wasPlaying) {
      this.stopSyncScheduler();

      if (this.part) {
        this.part.stop();
        this.part.cancel();
      }
      console.log("[AP.seek] wasPlaying", wasPlaying);
      console.log("[AP.seek] state.currentTime", this.state.currentTime);

      Tone.getTransport().cancel();

      Tone.getTransport().seconds = transportSeconds;
      console.info("[AP.seek] transport set", {
        transportSec: transportSeconds.toFixed(3),
        visualSec: clampedVisual.toFixed(3),
      });
      // Re-create the Part. If A-B loop is active, schedule only notes inside the window.
      if (this.sampler) {
        if (this._loopStartVisual !== null && this._loopEndVisual !== null) {
          this.setupNotePart(this._loopStartVisual, this._loopEndVisual);
        } else {
          this.setupNotePart();
        }
      }

      if (this.part) {
        const offsetForPart =
          this._loopStartVisual !== null ? 0 : transportSeconds;
        this.part.start("+0", offsetForPart);
      }

      if (Tone.getTransport().state !== "started") {
        Tone.getTransport().start();
      }

      // Re-trigger any notes that are currently sounding so they continue
      // through the seek point. This prevents audible gaps immediately
      // after muting/unmuting tracks (which recreates the AudioPlayer).
      this.retriggerHeldNotes(clampedVisual);

      // Clear seeking flag after a short delay (50 ms). Then process any queued seek.
      setTimeout(() => {
        console.log("[AP.seek] end", {
          transportSec: Tone.getTransport().seconds.toFixed(3),
          pausedTime: this.pausedTime.toFixed(3),
          currentTime: this.state.currentTime.toFixed(3),
          isSeeking: this.operationState.isSeeking,
        });
        console.groupEnd();

        this.operationState.isSeeking = false;

        // Re-attach Transport event callbacks now that the seek is finished.
        this.setupTransportCallbacks();

        // If another seek was queued while this one was executing, perform it now.
        if (this.operationState.pendingSeek !== null) {
          const next = this.operationState.pendingSeek;
          this.operationState.pendingSeek = null;
          this.seek(next);
          return; // early exit; nested seek will handle scheduler
        }

        if (this.state.isPlaying) {
          this.startSyncScheduler();
        }
      }, 50);
    } else {
      Tone.getTransport().seconds = transportSeconds;

      console.log(
        "[AudioPlayer.seek] paused Transport set to",
        Tone.getTransport().seconds.toFixed(3),
        "s"
      );
      this.operationState.isSeeking = false;
    }

    // Update visual playhead immediately (unless caller opts out)
    if (updateVisual) {
      this.scheduleVisualUpdate(() => {
        this.pianoRoll.setTime(clampedVisual);
      });
    }

    // Ensure any lingering voices are released to prevent polyphony limits
    if (this.sampler && (this.sampler as any).releaseAll) {
      (this.sampler as any).releaseAll();
    }
  }

  /**
   * Set playback volume
   */
  public setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.state.volume = clampedVolume;

    // Ensure future initialization uses the latest volume (e.g., muted before first play)
    this.options.volume = clampedVolume;

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
      this.operationState.isSeeking = true;

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

        // Use Tone.js scheduling for immediate reschedule
        Tone.getTransport().schedule((time) => {
          if (this.part) {
            this.part.start(time, newTransportSeconds);
          }
          // Clear seeking flag after rescheduling
          this.operationState.isSeeking = false;
        }, Tone.now());
      }

      // Update transport position to match
      Tone.getTransport().seconds = newTransportSeconds;
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
   * Set custom A-B loop points (in seconds).
   * Passing `null` for both parameters clears the loop.
   * If only `start` is provided, the loop will extend to the end of the piece.
   */
  public setLoopPoints(start: number | null, end: number | null): void {
    // Clear looping if start is null ---------------------------------------
    if (start === null) {
      this._loopStartVisual = null;
      this._loopEndVisual = null;
      this.toggleRepeat(false);

      // Rebuild full Part so that future playback uses all notes
      if (this.sampler) {
        if (this.part) {
          this.part.stop();
          this.part.cancel();
          this.part.dispose();
        }
        this.setupNotePart();
      }
      return;
    }

    // Normalize end --------------------------------------------------------
    // Ensure end is within the bounds of the piece. If omitted or invalid,
    // fall back to the total duration. Also clamp any oversized value to the
    // piece length so that visual and audio loop windows remain aligned.
    if (end === null || end <= start) {
      end = this.state.duration;
    } else {
      end = Math.min(end, this.state.duration);
    }

    this._loopStartVisual = start;
    this._loopEndVisual = end;
    this.state.isRepeating = true;

    const transportStart = (start * this.originalTempo) / this.state.tempo;
    const transportEnd = (end * this.originalTempo) / this.state.tempo;
    const transport = Tone.getTransport();

    // --- Rebuild Part relative to loop window ----------------------------
    if (this.sampler) {
      if (this.part) {
        this.part.stop();
        this.part.cancel();
        this.part.dispose();
      }
      this.setupNotePart(start, end);
      // Only the Transport is set to loop. Leaving the Part non-looping avoids
      // duplicate scheduling (Part + Transport) that caused silent or mangled
      // playback after the first iteration of an A-B loop.
      if (this.part) {
        this.part.loop = false;
      }
    }

    // --- Configure Transport looping -------------------------------------
    transport.loop = true;
    transport.loopStart = transportStart;
    transport.loopEnd = transportEnd;

    // Jump transport to start of loop window and sync state ------------
    transport.seconds = transportStart;
    this.state.currentTime = start;
    this.pausedTime = transportStart;

    // (Re)start Part from beginning of its window when playing ----------
    if (this.state.isPlaying && this.part) {
      // Ensure any previous scheduling is cleared
      this.part.stop();
      this.part.start("+0", 0);
    }
  }

  /**
   * Get current player state
   */
  public getState(): AudioPlayerState {
    // When a seek or restart operation is active, Transport may report transient
    // positions (e.g., 0:00 after cancel/stop) that do not reflect the final
    // target location.  Returning the cached state during these brief windows
    // prevents UI widgets (seek-bar, time display) from momentarily jumping
    // backwards before snapping to the intended seek point.
    if (this.operationState.isSeeking || this.operationState.isRestarting) {
      return { ...this.state };
    }

    // Synchronise state with the live Tone.Transport on *every* call so that
    // UI components (seek-bar, time-display, etc.) always receive an up-to-date
    // playback position even if the internal sync-scheduler is paused or has
    // not started yet.

    const transport = Tone.getTransport();

    // Update the «isPlaying» flag directly from the transport.
    this.state.isPlaying = transport.state === "started";

    // Derive the current visual time from the transport position.  This makes
    // `getState()` fully authoritative for the playhead location and prevents
    // situations where `currentTime` remains stuck at 0 when the transport is
    // actually running (e.g., when the sync-scheduler failed to start).
    const transportSeconds = transport.seconds;
    const visualSeconds =
      (transportSeconds * this.state.tempo) / this.originalTempo;

    // Clamp inside piece duration to avoid returning values slightly past the
    // end due to floating-point rounding.
    this.state.currentTime = Math.min(visualSeconds, this.state.duration);

    return { ...this.state };
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    // Detach transport callbacks before manipulating the Transport to avoid
    // unintended "stop" / "pause" events resetting the visual playhead.
    this.removeTransportCallbacks();

    // Ensure the global transport is fully stopped and cleared so that the
    // next AudioPlayer instance starts from a clean state. This prevents
    // silent playback when a new Part is created while the previous
    // Transport is still running.
    const transport = Tone.getTransport();
    if (transport.state !== "stopped") {
      transport.stop();
    }
    transport.cancel();

    this.stopSyncScheduler();

    if (this.part) {
      this.part.dispose();
      this.part = null;
    }

    if (this.sampler) {
      this.sampler.dispose();
      this.sampler = null;
    }

    if (this.panner) {
      this.panner.dispose();
      this.panner = null;
    }
  }

  /**
   * Set stereo pan value (-1 left, 0 center, 1 right)
   */
  public setPan(pan: number): void {
    if (!this.panner) return;
    const clamped = Math.max(-1, Math.min(1, pan));
    this.panner.pan.value = clamped;
    this.state.pan = clamped;
  }

  private retriggerHeldNotes(currentTime: number): void {
    if (!this.sampler) return;

    // Trigger any note whose onset is before the cursor and whose end is after it.
    const EPS = 1e-3; // small epsilon to account for FP rounding
    const now = Tone.now();
    this.notes.forEach((note) => {
      const noteStart = note.time;
      const noteEnd = note.time + note.duration;
      if (noteStart < currentTime - EPS && noteEnd > currentTime + EPS) {
        const remaining = noteEnd - currentTime;
        if (remaining > 0) {
          this.sampler!.triggerAttackRelease(
            note.name,
            remaining,
            now,
            note.velocity
          );
        }
      }
    });
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
): AudioPlayerContainer {
  const player = new AudioPlayer(notes, pianoRoll, options);
  // Expose public controls only
  return player;
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
