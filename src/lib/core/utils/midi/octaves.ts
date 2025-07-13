/**
 * Extracts the octave number from a MIDI note number
 * @param midi - MIDI note number (0-127)
 * @returns Octave number (where C4 = octave 4)
 *
 * @example
 * ```typescript
 * midiToOctave(60); // 4 (C4)
 * midiToOctave(72); // 5 (C5)
 * midiToOctave(48); // 3 (C3)
 * ```
 */
export function midiToOctave(midi: number): number {
  if (midi < 0 || midi > 127) {
    throw new Error(`MIDI note number must be between 0 and 127, got ${midi}`);
  }

  return Math.floor(midi / 12) - 1;
}
