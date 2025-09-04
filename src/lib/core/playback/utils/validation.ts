/**
 * Validation utilities for playback module
 */

/**
 * Ensure an instance is initialized
 */
export function ensureInitialized(instance: unknown, name: string): void {
  if (!instance) {
    throw new Error(`${name} not initialized`);
  }
}

/**
 * Ensure a value is within valid range
 */
export function ensureInRange(
  value: number,
  min: number,
  max: number,
  name: string
): void {
  if (value < min || value > max) {
    throw new RangeError(
      `${name} must be between ${min} and ${max}, got ${value}`
    );
  }
}

/**
 * Validation helpers for common playback values
 */
export const PlaybackValidation = {
  /**
   * Validate volume is in valid range
   */
  validateVolume(volume: number): void {
    ensureInRange(volume, 0, 1, 'Volume');
  },

  /**
   * Validate tempo is in valid range
   */
  validateTempo(tempo: number, min: number = 30, max: number = 300): void {
    ensureInRange(tempo, min, max, 'Tempo');
  },

  /**
   * Validate pan is in valid range
   */
  validatePan(pan: number): void {
    ensureInRange(pan, -1, 1, 'Pan');
  },

  /**
   * Validate time is non-negative
   */
  validateTime(time: number): void {
    if (time < 0) {
      throw new RangeError(`Time must be non-negative, got ${time}`);
    }
  },

  /**
   * Validate playback rate
   */
  validatePlaybackRate(rate: number, min: number = 0.25, max: number = 4): void {
    ensureInRange(rate, min, max, 'Playback rate');
  },

  /**
   * Check if audio context is ready
   */
  isAudioContextReady(context: AudioContext | null): boolean {
    return context !== null && context.state === 'running';
  },

  /**
   * Ensure audio context is ready
   */
  ensureAudioContextReady(context: AudioContext | null): void {
    if (!context) {
      throw new Error('AudioContext not initialized');
    }
    
    if (context.state !== 'running') {
      throw new Error(`AudioContext is ${context.state}, expected running`);
    }
  }
};