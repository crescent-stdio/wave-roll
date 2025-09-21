/**
 * Loop Manager
 * Handles A-B loop functionality for audio playback
 */

import * as Tone from "tone";
import { AudioPlayerState } from "../player-types";

export class LoopManager {
  private _loopStartVisual: number | null = null;
  private _loopEndVisual: number | null = null;
  private _loopCounter = 0;
  private originalTempo: number;
  
  // Add loopStartTransport property
  get loopStartTransport(): number | null {
    if (this._loopStartVisual === null) return null;
    const currentTempo = Tone.getTransport().bpm.value;
    return (this._loopStartVisual * this.originalTempo) / currentTempo;
  }
  
  constructor(originalTempo: number) {
    this.originalTempo = originalTempo;
  }

  /**
   * Get current loop start point in visual time
   */
  get loopStartVisual(): number | null {
    return this._loopStartVisual;
  }

  /**
   * Get current loop end point in visual time
   */
  get loopEndVisual(): number | null {
    return this._loopEndVisual;
  }

  /**
   * Check if custom loop is active
   */
  hasCustomLoop(): boolean {
    return this._loopStartVisual !== null && this._loopEndVisual !== null;
  }

  /**
   * Set custom A-B loop points (in seconds).
   * Passing `null` for both parameters clears the loop.
   * If only `start` is provided, the loop will extend to the end of the piece.
   */
  setLoopPoints(
    start: number | null,
    end: number | null,
    duration: number,
    state: AudioPlayerState
  ): {
    changed: boolean;
    transportStart: number;
    transportEnd: number;
    shouldPreservePosition: boolean;
  } {
    // Skip when the requested loop configuration is identical to the one that is already active
    if (start === this._loopStartVisual && end === this._loopEndVisual) {
      return {
        changed: false,
        transportStart: 0,
        transportEnd: duration,
        shouldPreservePosition: false,
      };
    }

    // If only B is provided (start is null, end has a value), loop [0, end)
    if (start === null) {
      if (end === null) {
        // Clear loop entirely
        this._loopStartVisual = null;
        this._loopEndVisual = null;
        this._loopCounter = 0;
        return {
          changed: true,
          transportStart: 0,
          transportEnd: duration,
          shouldPreservePosition: false,
        };
      }

      // B-only loop => treat A = 0
      const clampedEnd = Math.min(Math.max(0, end), duration);
      this._loopStartVisual = 0;
      this._loopEndVisual = clampedEnd;
      this._loopCounter = 0;

      const transportStart = 0;
      const transportEnd = (clampedEnd * this.originalTempo) / state.tempo;
      const currentPosition = state.currentTime;
      const shouldPreservePosition = currentPosition >= 0 && currentPosition <= clampedEnd;

      return {
        changed: true,
        transportStart,
        transportEnd,
        shouldPreservePosition,
      };
    }

    // Policy update: If only A is provided (end is null), DO NOT activate loop.
    // Treat this as "no custom loop window" to satisfy the UX requirement
    // that A-only should not produce section looping.
    if (end === null) {
      this._loopStartVisual = null;
      this._loopEndVisual = null;
      this._loopCounter = 0;
      return {
        changed: true,
        transportStart: 0,
        transportEnd: duration,
        shouldPreservePosition: true,
      };
    }

    // Normalize end (A and B both present)
    if (end <= start) {
      end = duration;
    } else {
      end = Math.min(end, duration);
    }

    this._loopStartVisual = start;
    this._loopEndVisual = end;
    this._loopCounter = 0;

    const transportStart = (start * this.originalTempo) / state.tempo;
    const transportEnd = (end * this.originalTempo) / state.tempo;
    const currentPosition = state.currentTime;
    const shouldPreservePosition =
      currentPosition >= start && currentPosition <= end;

    return {
      changed: true,
      transportStart,
      transportEnd,
      shouldPreservePosition,
    };
  }

  /**
   * Configure transport for looping
   */
  configureTransportLoop(
    enabled: boolean,
    state: AudioPlayerState,
    duration: number
  ): void {
    const transport = Tone.getTransport();

    if (enabled) {
      transport.loop = true;
      // Use existing loop points if set, otherwise use full duration
      if (this._loopStartVisual !== null && this._loopEndVisual !== null) {
        const transportStart =
          (this._loopStartVisual * this.originalTempo) / state.tempo;
        const transportEnd =
          (this._loopEndVisual * this.originalTempo) / state.tempo;
        transport.loopStart = transportStart;
        transport.loopEnd = transportEnd;
      } else {
        transport.loopStart = 0;
        transport.loopEnd =
          (duration * this.originalTempo) / state.tempo;
      }
    } else {
      transport.loop = false;
    }
  }

  /**
   * Handle transport loop event
   */
  handleLoopEvent(): number {
    this._loopCounter++;
    
    // Extract Transport loop bounds
    const loopStart = Tone.getTransport().loopStart as number;
    const loopEnd = Tone.getTransport().loopEnd as number;

    // Print one-time debug info on the first repetition
    if (this._loopCounter === 1) {
      // console.log("[Transport.loop] A-B loop started", {
      //   loopStart: loopStart.toFixed(3),
      //   loopEnd: loopEnd.toFixed(3),
      //   visualStart: this._loopStartVisual,
      //   visualEnd: this._loopEndVisual,
      // });
    }

    // Return visual start position for the loop
    return this._loopStartVisual !== null ? this._loopStartVisual : 0;
  }

  /**
   * Get offset for Part start based on current position and loop
   * Note: This is only used for A-B loops. Without loops, use visual time directly.
   */
  getPartOffset(
    currentTime: number,
    pausedTime: number
  ): number {
    if (this._loopStartVisual !== null && this._loopEndVisual !== null) {
      // Offset is the visual distance from loop start (visual seconds)
      return Math.max(0, currentTime - this._loopStartVisual);
    }
    // No custom loop - use visual time directly
    return currentTime;
  }

  /**
   * Filter notes for loop window
   */
  filterNotesForLoop<T extends { time: number; duration: number }>(
    notes: T[]
  ): T[] {
    if (
      this._loopStartVisual === undefined ||
      this._loopEndVisual === undefined ||
      this._loopStartVisual === null ||
      this._loopEndVisual === null
    ) {
      // No window - include all notes
      return notes;
    }

    // When a custom loop window is active, keep any note that INTERSECTS
    // [loopStartVisual, loopEndVisual).  This includes notes whose onset
    // is earlier than the loop window but whose tail sustains into it.
    return notes.filter((note) => {
      const noteEnd = note.time + note.duration;
      return (
        noteEnd > this._loopStartVisual! && note.time < this._loopEndVisual!
      );
    });
  }

  /**
   * Adjust note time relative to loop start
   */
  adjustNoteTimeForLoop(noteTime: number): number {
    if (this._loopStartVisual !== undefined && this._loopStartVisual !== null) {
      return noteTime - this._loopStartVisual;
    }
    return noteTime;
  }

  /**
   * Reset loop counter
   */
  resetCounter(): void {
    this._loopCounter = 0;
  }

  /**
   * Update original tempo reference
   */
  updateOriginalTempo(tempo: number): void {
    this.originalTempo = tempo;
  }

  /**
   * Adjust current A-B loop visual positions when tempo changes, so that
   * their underlying transport positions remain anchored. This effectively
   * rescales visual loop points by (newTempo / oldTempo).
   */
  rescaleLoopForTempoChange(oldTempo: number, newTempo: number, duration: number): void {
    if (
      this._loopStartVisual === null ||
      this._loopEndVisual === null ||
      oldTempo <= 0 ||
      newTempo <= 0
    ) {
      return;
    }
    const scale = newTempo / oldTempo;
    const newStart = Math.max(0, Math.min(duration, this._loopStartVisual * scale));
    const newEnd = Math.max(newStart, Math.min(duration, this._loopEndVisual * scale));
    this._loopStartVisual = newStart;
    this._loopEndVisual = newEnd;
  }
}
