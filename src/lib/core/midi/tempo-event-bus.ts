/**
 * TempoEventBus - Event bus for MIDI tempo synchronization
 *
 * Implements the Late Subscriber pattern to solve race conditions where
 * VisualizationEngine may subscribe after MultiMidiManager has already
 * emitted the tempo event.
 *
 * Supports two types of tempo events:
 * 1. Regular tempo events (emit) - notifies subscribers of tempo changes
 * 2. Baseline reset events (emitBaselineReset) - resets the baseline/original
 *    tempo when the "top file" changes (e.g., file deletion, reordering)
 */

/** Callback type for tempo event subscribers */
type TempoEventCallback = (tempo: number, fileId: string) => void;

/** Callback type for baseline reset subscribers */
type BaselineResetCallback = (tempo: number, fileId: string) => void;

/**
 * Event bus for broadcasting MIDI tempo changes across components.
 * Supports late subscribers by storing the last emitted value.
 */
class TempoEventBus {
  private listeners: Set<TempoEventCallback> = new Set();
  private baselineListeners: Set<BaselineResetCallback> = new Set();
  private lastTempo: number | null = null;
  private lastFileId: string | null = null;
  /** Stores the baseline tempo (top file's BPM) */
  private baselineTempo: number | null = null;
  private baselineFileId: string | null = null;

  /**
   * Emit a tempo event to all subscribers.
   * Always stores the latest value for late subscribers.
   *
   * @param tempo - The tempo in BPM extracted from MIDI header
   * @param fileId - The ID of the MIDI file
   */
  emit(tempo: number, fileId: string): void {
    // Always update for late subscribers - store the most recent tempo
    this.lastTempo = tempo;
    this.lastFileId = fileId;

    // Notify all current listeners
    this.listeners.forEach((cb) => {
      try {
        cb(tempo, fileId);
      } catch (error) {
        console.error("[TempoEventBus] Error in listener callback:", error);
      }
    });
  }

  /**
   * Subscribe to tempo events.
   * If a tempo has already been emitted, the callback is invoked immediately
   * with the stored value (late subscriber pattern).
   *
   * @param cb - Callback function to invoke on tempo events
   * @returns Unsubscribe function to remove the listener
   */
  subscribe(cb: TempoEventCallback): () => void {
    this.listeners.add(cb);

    // Late subscriber: immediately deliver stored value if available
    if (this.lastTempo !== null && this.lastFileId !== null) {
      try {
        cb(this.lastTempo, this.lastFileId);
      } catch (error) {
        console.error(
          "[TempoEventBus] Error in late subscriber callback:",
          error
        );
      }
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Get the last emitted tempo value.
   * @returns The last tempo or null if none emitted yet
   */
  getLastTempo(): number | null {
    return this.lastTempo;
  }

  /**
   * Emit a baseline reset event.
   * This is used when the "top file" (first file in the list) changes,
   * such as when a file is deleted or files are reordered.
   * Subscribers should update their originalTempo to this new baseline.
   *
   * @param tempo - The new baseline tempo in BPM
   * @param fileId - The ID of the new top file
   */
  emitBaselineReset(tempo: number, fileId: string): void {
    this.baselineTempo = tempo;
    this.baselineFileId = fileId;

    // Also update last tempo for consistency
    this.lastTempo = tempo;
    this.lastFileId = fileId;

    // Notify baseline listeners
    this.baselineListeners.forEach((cb) => {
      try {
        cb(tempo, fileId);
      } catch (error) {
        console.error(
          "[TempoEventBus] Error in baseline listener callback:",
          error
        );
      }
    });

    // Also notify regular listeners
    this.listeners.forEach((cb) => {
      try {
        cb(tempo, fileId);
      } catch (error) {
        console.error("[TempoEventBus] Error in listener callback:", error);
      }
    });
  }

  /**
   * Subscribe to baseline reset events.
   * These events are emitted when the top file changes and the baseline
   * tempo should be updated (e.g., for originalTempo in VisualizationEngine).
   *
   * @param cb - Callback function to invoke on baseline reset
   * @returns Unsubscribe function to remove the listener
   */
  subscribeBaseline(cb: BaselineResetCallback): () => void {
    this.baselineListeners.add(cb);

    // Late subscriber: immediately deliver stored baseline if available
    if (this.baselineTempo !== null && this.baselineFileId !== null) {
      try {
        cb(this.baselineTempo, this.baselineFileId);
      } catch (error) {
        console.error(
          "[TempoEventBus] Error in late baseline subscriber callback:",
          error
        );
      }
    }

    return () => {
      this.baselineListeners.delete(cb);
    };
  }

  /**
   * Get the baseline tempo value.
   * @returns The baseline tempo or null if none set
   */
  getBaselineTempo(): number | null {
    return this.baselineTempo;
  }

  /**
   * Reset the event bus state.
   * Useful for testing or when clearing all MIDI files.
   */
  reset(): void {
    this.lastTempo = null;
    this.lastFileId = null;
    this.baselineTempo = null;
    this.baselineFileId = null;
    // Keep listeners intact - they may need future events
  }
}

/** Singleton instance of the tempo event bus */
export const tempoEventBus = new TempoEventBus();
