/**
 * TempoEventBus - Event bus for MIDI tempo synchronization
 *
 * Implements the Late Subscriber pattern to solve race conditions where
 * VisualizationEngine may subscribe after MultiMidiManager has already
 * emitted the tempo event.
 *
 * Note: First-file policy for originalTempo is handled by VisualizationEngine,
 * not here. This bus always stores the latest tempo for late subscribers.
 */

/** Callback type for tempo event subscribers */
type TempoEventCallback = (tempo: number, fileId: string) => void;

/**
 * Event bus for broadcasting MIDI tempo changes across components.
 * Supports late subscribers by storing the last emitted value.
 */
class TempoEventBus {
  private listeners: Set<TempoEventCallback> = new Set();
  private lastTempo: number | null = null;
  private lastFileId: string | null = null;

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
   * Reset the event bus state.
   * Useful for testing or when clearing all MIDI files.
   */
  reset(): void {
    this.lastTempo = null;
    this.lastFileId = null;
    // Keep listeners intact - they may need future events
  }
}

/** Singleton instance of the tempo event bus */
export const tempoEventBus = new TempoEventBus();
