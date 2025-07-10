import { noteMap, noteNames } from "./tables";

/**
 * Converts MIDI note number to scientific pitch notation
 * @param midi - MIDI note number (0-127, where 60 = C4)
 * @returns Scientific pitch notation (e.g., "C4", "A#3")
 *
 * @example
 * ```typescript
 * midiToNoteName(60); // "C4"
 * midiToNoteName(69); // "A4"
 * midiToNoteName(61); // "C#4"
 * ```
 */
export function midiToNoteName(midi: number): string {
  if (midi < 0 || midi > 127) {
    throw new Error(`MIDI note number must be between 0 and 127, got ${midi}`);
  }

  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${noteNames[noteIndex]}${octave}`;
}

/**
 * Converts scientific pitch notation to MIDI note number
 * @param noteName - Scientific pitch notation (e.g., "C4", "A#3")
 * @returns MIDI note number (0-127)
 *
 * @example
 * ```typescript
 * noteNameToMidi("C4"); // 60
 * noteNameToMidi("A4"); // 69
 * noteNameToMidi("C#4"); // 61
 * ```
 */
export function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([A-G][#B]?)(-?\d+)$/i);
  if (!match) {
    throw new Error(`Invalid note name format: ${noteName}`);
  }

  const [, note, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const noteValue = noteMap[note.toUpperCase()];

  if (noteValue === undefined) {
    throw new Error(`Invalid note name: ${note}`);
  }

  const midi = (octave + 1) * 12 + noteValue;

  if (midi < 0 || midi > 127) {
    throw new Error(
      `MIDI note number ${midi} is out of range (0-127) for note ${noteName}`
    );
  }

  return midi;
}
