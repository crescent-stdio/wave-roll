/**
 * Utility functions for MIDI note conversion and manipulation
 */

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

  const noteNames = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return `${noteNames[noteIndex]}${octave}`;
}

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

  const noteNames = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  return noteNames[midi % 12];
}

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
  const noteMap: { [key: string]: number } = {
    C: 0,
    "C#": 1,
    DB: 1,
    D: 2,
    "D#": 3,
    EB: 3,
    E: 4,
    F: 5,
    "F#": 6,
    GB: 6,
    G: 7,
    "G#": 8,
    AB: 8,
    A: 9,
    "A#": 10,
    BB: 10,
    B: 11,
  };

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
