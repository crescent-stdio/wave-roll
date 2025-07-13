import { noteNames } from "./tables";

/**
 * Extracts the pitch class from a MIDI note number
 * @param midi - MIDI note number (0-127)
 * @returns Pitch class without octave (e.g., "C", "A#")
 *
 * @example
 * ```typescript
 * midiToPitchClass(60); // "C"
 * midiToPitchClass(72); // "C" (different octave)
 * midiToPitchClass(61); // "C#"
 * ```
 */
export function midiToPitchClass(midi: number): string {
  if (midi < 0 || midi > 127) {
    throw new Error(`MIDI note number must be between 0 and 127, got ${midi}`);
  }

  return noteNames[midi % 12];
}
