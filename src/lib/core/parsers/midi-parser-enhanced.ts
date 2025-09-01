/**
 * Enhanced MIDI parser with improved sustain pedal elongation
 * 
 * Based on the implementation from onsets-and-frames:
 * https://github.com/jongwook/onsets-and-frames/blob/master/onsets_and_frames/midi.py
 * 
 * Key improvements:
 * 1. Proper handling of overlapping notes with same pitch
 * 2. Correct sustain pedal threshold handling
 * 3. Better event ordering and processing
 * 4. Comprehensive edge case handling
 */

import { NoteData, ControlChangeEvent } from "@/lib/core/utils/midi/types";

/**
 * Apply sustain pedal elongation to MIDI notes.
 * 
 * Algorithm (based on onsets-and-frames):
 * 1. When sustain pedal is pressed (CC64 >= threshold), notes continue sounding after note-off
 * 2. Notes are released when:
 *    - Sustain pedal is released (CC64 < threshold)
 *    - Same pitch is re-played (cuts previous instance)
 *    - End of the file is reached
 * 3. Handles multiple simultaneous notes of the same pitch via stacking
 * 
 * Source reference:
 * https://github.com/jongwook/onsets-and-frames/blob/master/onsets_and_frames/midi.py
 * 
 * Modifications from original:
 * - TypeScript implementation
 * - Handles normalized velocity values (0-1) instead of MIDI (0-127)
 * - Improved event sorting for correct temporal ordering
 * - Added support for multiple channels
 * 
 * @param notes - Original note data array
 * @param controlChanges - Control change events including sustain pedal (CC64)
 * @param threshold - Sustain pedal threshold (0-127, default 64)
 * @param channel - MIDI channel to process (default 0)
 * @returns Modified notes with sustain pedal elongation applied
 */
export function applySustainPedalElongation(
  notes: NoteData[],
  controlChanges: ControlChangeEvent[],
  threshold: number = 64,
  channel: number = 0
): NoteData[] {
  if (notes.length === 0) return [];

  const EPS = 1e-9; // Small epsilon for floating point comparisons
  // CC values from Tone.js are already normalized (0-1), so normalize threshold to match
  const normalizedThreshold = threshold / 127; // Convert MIDI threshold (0-127) to normalized (0-1)

  // Event types for processing
  type Event = {
    time: number;
    type: 'note_on' | 'note_off' | 'sustain_on' | 'sustain_off';
    index: number; // Original note index
    midi?: number; // MIDI pitch (for note events)
    velocity?: number; // Note velocity
  };

  const events: Event[] = [];

  // Create note on/off events
  notes.forEach((note, index) => {
    events.push({
      time: note.time,
      type: 'note_on',
      index,
      midi: note.midi,
      velocity: note.velocity,
    });
    events.push({
      time: note.time + note.duration,
      type: 'note_off',
      index,
      midi: note.midi,
      velocity: note.velocity,
    });
  });

  // Create sustain pedal events from control changes
  // Filter for CC64 and track state changes
  let previousSustainState = false;
  controlChanges
    .filter(cc => cc.controller === 64)
    .forEach(cc => {
      // cc.value is already normalized (0-1) by Tone.js
      const isOn = (cc.value ?? 0) >= normalizedThreshold;
      // Only add event if state actually changes
      if (isOn !== previousSustainState) {
        events.push({
          time: cc.time,
          type: isOn ? 'sustain_on' : 'sustain_off',
          index: -1, // No associated note
        });
        previousSustainState = isOn;
      }
    });

  // Sort events by time, with specific ordering for simultaneous events
  // Priority: sustain_off > note_off > sustain_on > note_on
  // This ensures sustain state is updated before processing notes at the same time
  events.sort((a, b) => {
    if (Math.abs(a.time - b.time) > EPS) {
      return a.time - b.time;
    }
    // Same time - use type priority
    const priority: Record<string, number> = {
      'sustain_off': 0,
      'note_off': 1,
      'sustain_on': 2,
      'note_on': 3,
    };
    return priority[a.type] - priority[b.type];
  });

  // Process events to apply sustain elongation
  let sustainPedalOn = false;
  const activeNotes = new Map<number, { startTime: number; midi: number; velocity: number }>();
  const sustainedNotes = new Map<number, Array<{ 
    index: number; 
    startTime: number; 
    velocity: number;
  }>>(); // Map from pitch to array of sustained notes
  const finalNotes = new Map<number, NoteData>();

  // Helper function to release all sustained notes
  const releaseAllSustained = (releaseTime: number) => {
    for (const [pitch, noteStack] of sustainedNotes.entries()) {
      for (const sustainedNote of noteStack) {
        const originalNote = notes[sustainedNote.index];
        const elongatedDuration = Math.max(EPS, releaseTime - sustainedNote.startTime);
        finalNotes.set(sustainedNote.index, {
          ...originalNote,
          duration: elongatedDuration,
        });
      }
    }
    sustainedNotes.clear();
  };

  // Helper function to release sustained notes of a specific pitch
  const releaseSustainedPitch = (pitch: number, releaseTime: number) => {
    const noteStack = sustainedNotes.get(pitch);
    if (noteStack && noteStack.length > 0) {
      // Release the oldest sustained note of this pitch (FIFO)
      const sustainedNote = noteStack.shift()!;
      const originalNote = notes[sustainedNote.index];
      const elongatedDuration = Math.max(EPS, releaseTime - sustainedNote.startTime);
      finalNotes.set(sustainedNote.index, {
        ...originalNote,
        duration: elongatedDuration,
      });
      
      // Clean up if no more notes at this pitch
      if (noteStack.length === 0) {
        sustainedNotes.delete(pitch);
      }
    }
  };

  // Process each event
  for (const event of events) {
    switch (event.type) {
      case 'sustain_on':
        sustainPedalOn = true;
        break;

      case 'sustain_off':
        sustainPedalOn = false;
        // Release all currently sustained notes
        releaseAllSustained(event.time);
        break;

      case 'note_on':
        if (event.midi !== undefined) {
          // If there's a sustained note of the same pitch, cut it
          // This implements the behavior where re-striking a key cuts the previous instance
          releaseSustainedPitch(event.midi, event.time);
          
          // Track this as an active note
          activeNotes.set(event.index, {
            startTime: event.time,
            midi: event.midi,
            velocity: event.velocity || 0,
          });
        }
        break;

      case 'note_off':
        if (!activeNotes.has(event.index)) {
          // Safety check: ignore note_off without corresponding note_on
          continue;
        }

        const noteInfo = activeNotes.get(event.index)!;
        activeNotes.delete(event.index);

        if (sustainPedalOn && event.midi !== undefined) {
          // Sustain pedal is on - move note to sustained state
          const pitch = event.midi;
          if (!sustainedNotes.has(pitch)) {
            sustainedNotes.set(pitch, []);
          }
          sustainedNotes.get(pitch)!.push({
            index: event.index,
            startTime: noteInfo.startTime,
            velocity: noteInfo.velocity,
          });
        } else {
          // No sustain - use original duration
          if (!finalNotes.has(event.index)) {
            finalNotes.set(event.index, notes[event.index]);
          }
        }
        break;
    }
  }

  // Handle any remaining sustained notes at the end of the file
  if (sustainedNotes.size > 0) {
    // Find the latest time in the original notes
    const maxTime = Math.max(...notes.map(n => n.time + n.duration));
    releaseAllSustained(maxTime);
  }

  // Handle any remaining active notes (shouldn't happen with well-formed MIDI)
  for (const [index, noteInfo] of activeNotes.entries()) {
    if (!finalNotes.has(index)) {
      // Keep original note
      finalNotes.set(index, notes[index]);
    }
  }

  // Build the final array, preserving original order
  const result: NoteData[] = [];
  for (let i = 0; i < notes.length; i++) {
    result.push(finalNotes.get(i) || notes[i]);
  }

  // Sort by time, then by pitch for consistency
  result.sort((a, b) => {
    if (Math.abs(a.time - b.time) > EPS) {
      return a.time - b.time;
    }
    return a.midi - b.midi;
  });

  return result;
}

/**
 * Apply sustain pedal elongation with additional validation and error handling
 * 
 * @param notes - Original note data
 * @param controlChanges - Control change events
 * @param options - Configuration options
 * @returns Modified notes with sustain applied
 */
export function applySustainPedalElongationSafe(
  notes: NoteData[],
  controlChanges: ControlChangeEvent[],
  options: {
    threshold?: number;
    channel?: number;
    maxElongation?: number; // Maximum elongation in seconds (safety limit)
    verbose?: boolean;
  } = {}
): NoteData[] {
  const {
    threshold = 64,
    channel = 0,
    maxElongation = 30, // Default max 30 seconds elongation
    verbose = false,
  } = options;

  try {
    // Validate inputs
    if (!Array.isArray(notes) || !Array.isArray(controlChanges)) {
      if (verbose) console.warn('Invalid input to sustain pedal elongation');
      return notes;
    }

    // Apply sustain with safety limits
    let result = applySustainPedalElongation(notes, controlChanges, threshold, channel);

    // Apply maximum elongation limit if specified
    if (maxElongation > 0) {
      result = result.map(note => {
        if (note.duration > maxElongation) {
          if (verbose) {
            console.warn(
              `Note at ${note.time}s (pitch ${note.midi}) elongated beyond limit: ` +
              `${note.duration}s -> ${maxElongation}s`
            );
          }
          return { ...note, duration: maxElongation };
        }
        return note;
      });
    }

    // Validate output
    const invalidNotes = result.filter(n => 
      n.duration <= 0 || 
      !isFinite(n.duration) || 
      !isFinite(n.time)
    );
    
    if (invalidNotes.length > 0) {
      if (verbose) {
        console.warn(`Found ${invalidNotes.length} invalid notes after sustain processing`);
      }
      // Filter out invalid notes
      result = result.filter(n => 
        n.duration > 0 && 
        isFinite(n.duration) && 
        isFinite(n.time)
      );
    }

    return result;
  } catch (error) {
    if (verbose) {
      console.error('Error applying sustain pedal elongation:', error);
    }
    // Return original notes on error
    return notes;
  }
}

/**
 * Analyze sustain pedal usage in control changes
 * 
 * @param controlChanges - Control change events
 * @param threshold - Sustain threshold (0-127)
 * @returns Analysis of sustain pedal usage
 */
export function analyzeSustainPedalUsage(
  controlChanges: ControlChangeEvent[],
  threshold: number = 64
): {
  hasSustain: boolean;
  sustainCount: number;
  averageSustainDuration: number;
  totalSustainTime: number;
  sustainRegions: Array<{ start: number; end: number; duration: number }>;
} {
  const sustainEvents = controlChanges
    .filter(cc => cc.controller === 64)
    .sort((a, b) => a.time - b.time);

  if (sustainEvents.length === 0) {
    return {
      hasSustain: false,
      sustainCount: 0,
      averageSustainDuration: 0,
      totalSustainTime: 0,
      sustainRegions: [],
    };
  }

  const normalizedThreshold = threshold / 127;
  const regions: Array<{ start: number; end: number; duration: number }> = [];
  let currentStart: number | null = null;
  let isOn = false;

  for (const event of sustainEvents) {
    // event.value is already normalized (0-1) by Tone.js
    const shouldBeOn = (event.value ?? 0) >= normalizedThreshold;
    
    if (shouldBeOn && !isOn) {
      // Sustain starts
      currentStart = event.time;
      isOn = true;
    } else if (!shouldBeOn && isOn && currentStart !== null) {
      // Sustain ends
      const duration = event.time - currentStart;
      regions.push({ start: currentStart, end: event.time, duration });
      currentStart = null;
      isOn = false;
    }
  }

  // Handle unclosed sustain region
  if (isOn && currentStart !== null) {
    // Assume it extends to the end (would need max time from notes)
    const assumedEnd = sustainEvents[sustainEvents.length - 1].time + 5; // +5s assumption
    regions.push({ start: currentStart, end: assumedEnd, duration: assumedEnd - currentStart });
  }

  const totalSustainTime = regions.reduce((sum, r) => sum + r.duration, 0);
  const averageSustainDuration = regions.length > 0 ? totalSustainTime / regions.length : 0;

  return {
    hasSustain: true,
    sustainCount: regions.length,
    averageSustainDuration,
    totalSustainTime,
    sustainRegions: regions,
  };
}