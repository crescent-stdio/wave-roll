/**
 * Wave Roll - A TypeScript library for parsing MIDI files
 *
 * This library provides functionality to parse MIDI files from URLs or File objects
 * and extract musical data in the Tone.js format, focusing on piano tracks.
 *
 * @packageDocumentation
 */

// Import and export the main parsing function
import { parseMidi } from "./midi-parser";
export { parseMidi };

// Export all type definitions
export type {
  ParsedMidi,
  MidiInput,
  NoteData,
  TrackData,
  MidiHeader,
  TempoEvent,
  TimeSignatureEvent,
} from "./types";

// Export utility functions that might be useful
export {
  /**
   * Converts MIDI note number to scientific pitch notation
   * @param midi - MIDI note number (0-127)
   * @returns Scientific pitch notation (e.g., "C4", "A#3")
   */
  midiToNoteName,

  /**
   * Extracts the pitch class from a MIDI note number
   * @param midi - MIDI note number (0-127)
   * @returns Pitch class (e.g., "C", "A#")
   */
  midiToPitchClass,

  /**
   * Extracts the octave number from a MIDI note number
   * @param midi - MIDI note number (0-127)
   * @returns Octave number
   */
  midiToOctave,
} from "./utils";

// Export MIDI player functionality
export {
  /**
   * Creates a MIDI player with piano-roll visualization
   */
  createMidiPlayer,

  /**
   * Converts ArrayBuffer to base64 data URL for MIDI data
   */
  arrayBufferToDataUrl,

  /**
   * Converts ArrayBuffer to Blob URL for MIDI data (more efficient)
   */
  arrayBufferToBlobUrl,

  /**
   * Cleans up cached blob URLs to prevent memory leaks
   */
  cleanupBlobUrls,

  /**
   * Loads html-midi-player Web Components
   */
  loadPlayerComponents,

  /**
   * Checks if player components are available
   */
  isPlayerAvailable,

  /**
   * Debug function to check player state
   */
  debugPlayerState,
} from "./player";

// Export player types
export type { MidiPlayerOptions } from "./player";

// Export piano roll visualizer
export {
  /**
   * Creates a PixiJS-based piano roll visualizer
   */
  createPianoRoll,

  /**
   * Piano roll class for advanced usage
   */
  PianoRoll,
} from "./piano-roll";

// Export piano roll types
export type { PianoRollOptions } from "./piano-roll";

// Export audio player functionality
export {
  /**
   * Creates a synchronized audio player for piano roll
   */
  createAudioPlayer,

  /**
   * Check if audio context is supported
   */
  isAudioSupported,

  /**
   * Get audio context state for debugging
   */
  getAudioContextState,
} from "./AudioPlayer";

// Export audio player types
export type {
  AudioPlayerControls,
  PlayerOptions,
  PlayerState,
  PianoRollSync,
} from "./AudioPlayer";

// Export player demo functionality
export {
  /**
   * Creates a complete player demo with controls
   */
  createPlayerDemo,

  /**
   * Player demo class for advanced usage
   */
  PlayerDemo,
} from "./PlayerDemo";

// Export player demo types
export type { PlayerDemoOptions } from "./PlayerDemo";

import "./wave-roll-element";

export { WaveRollMidiElement } from "./wave-roll-element";

/**
 * Default export of the main parsing function for convenience
 */
export default { parseMidi };
