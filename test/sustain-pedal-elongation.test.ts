import { describe, it, expect } from "vitest";
import { NoteData, ControlChangeEvent } from "@/lib/core/utils/midi/types";
import {
  applySustainPedalElongation,
  applySustainPedalElongationSafe,
  analyzeSustainPedalUsage,
} from "@/lib/core/parsers/midi-parser-enhanced";

/**
 * Test suite for sustain pedal elongation
 * Based on behavior from onsets-and-frames:
 * https://github.com/jongwook/onsets-and-frames/blob/master/onsets_and_frames/midi.py
 */

// Helper to create test notes
function createNote(
  midi: number,
  time: number,
  duration: number,
  velocity: number = 0.8
): NoteData {
  return {
    midi,
    time,
    duration,
    velocity,
    ticks: 0,
    name: "C4",
    pitch: "C",
    octave: 4,
  };
}

// Helper to create control change event
function createCC64(time: number, value: number): ControlChangeEvent {
  return {
    controller: 64,
    value: value / 127, // Normalize to 0-1
    time,
    ticks: 0,
  };
}

describe("Sustain Pedal Elongation", () => {
  it("should not change notes when no sustain pedal is used", () => {
    const notes = [
      createNote(60, 0.0, 0.5),
      createNote(62, 1.0, 0.5),
      createNote(64, 2.0, 0.5),
    ];
    const cc: ControlChangeEvent[] = [];

    const result = applySustainPedalElongation(notes, cc);

    expect(result).toHaveLength(3);
    expect(result[0].duration).toBeCloseTo(0.5);
    expect(result[1].duration).toBeCloseTo(0.5);
    expect(result[2].duration).toBeCloseTo(0.5);
  });

  it("should elongate notes when sustain pedal is held", () => {
    const notes = [
      createNote(60, 0.0, 0.5), // Ends at 0.5
      createNote(62, 1.0, 0.5), // Ends at 1.5
    ];
    const cc = [
      createCC64(0.0, 127), // Sustain on
      createCC64(2.0, 0),   // Sustain off at 2.0
    ];

    const result = applySustainPedalElongation(notes, cc, 64);

    // Both notes should be elongated to 2.0 (sustain release time)
    expect(result[0].duration).toBeCloseTo(2.0);
    expect(result[1].duration).toBeCloseTo(1.0); // 2.0 - 1.0 = 1.0
  });

  it("should cut previous note when same pitch is re-struck while sustained", () => {
    const notes = [
      createNote(60, 0.0, 0.5), // First C4
      createNote(60, 1.0, 0.5), // Second C4 (same pitch)
    ];
    const cc = [
      createCC64(0.0, 127), // Sustain on
      createCC64(3.0, 0),   // Sustain off
    ];

    const result = applySustainPedalElongation(notes, cc, 64);

    // First note should be cut at 1.0 (when second note starts)
    expect(result[0].duration).toBeCloseTo(1.0);
    // Second note should be elongated to 3.0
    expect(result[1].duration).toBeCloseTo(2.0); // 3.0 - 1.0 = 2.0
  });

  it("should handle multiple sustain on/off cycles", () => {
    const notes = [
      createNote(60, 0.0, 0.5),
      createNote(62, 2.0, 0.5),
      createNote(64, 4.0, 0.5),
    ];
    const cc = [
      createCC64(0.0, 127), // Sustain on
      createCC64(1.0, 0),   // Sustain off
      createCC64(2.0, 127), // Sustain on again
      createCC64(3.0, 0),   // Sustain off
    ];

    const result = applySustainPedalElongation(notes, cc, 64);

    // First note: elongated to 1.0 (first sustain off)
    expect(result[0].duration).toBeCloseTo(1.0);
    // Second note: elongated to 3.0 (second sustain off)
    expect(result[1].duration).toBeCloseTo(1.0); // 3.0 - 2.0 = 1.0
    // Third note: not affected (starts after sustain off)
    expect(result[2].duration).toBeCloseTo(0.5);
  });

  it("should respect sustain threshold", () => {
    const notes = [
      createNote(60, 0.0, 0.5),
      createNote(62, 1.0, 0.5),
    ];
    const cc = [
      createCC64(0.0, 60),  // Below default threshold (64)
      createCC64(0.5, 70),  // Above threshold
      createCC64(2.0, 30),  // Below threshold
    ];

    const result = applySustainPedalElongation(notes, cc, 64);

    // First note should not be sustained (CC value 60 < 64)
    expect(result[0].duration).toBeCloseTo(0.5);
    // Second note should be elongated (CC value 70 >= 64)
    expect(result[1].duration).toBeCloseTo(1.0); // 2.0 - 1.0 = 1.0
  });

  it("should handle overlapping notes of different pitches", () => {
    const notes = [
      createNote(60, 0.0, 2.0), // Long C4
      createNote(62, 0.5, 0.5), // D4 overlapping with C4
      createNote(64, 1.0, 0.5), // E4 overlapping with C4
    ];
    const cc = [
      createCC64(0.5, 127), // Sustain on during C4
      createCC64(3.0, 0),   // Sustain off
    ];

    const result = applySustainPedalElongation(notes, cc, 64);

    // C4: original duration (ends after sustain starts)
    expect(result[0].duration).toBeCloseTo(2.0);
    // D4: elongated to sustain off
    expect(result[1].duration).toBeCloseTo(2.5); // 3.0 - 0.5 = 2.5
    // E4: elongated to sustain off
    expect(result[2].duration).toBeCloseTo(2.0); // 3.0 - 1.0 = 2.0
  });

  it("should handle simultaneous events correctly", () => {
    const notes = [
      createNote(60, 1.0, 0.5), // Note starts at same time as sustain
    ];
    const cc = [
      createCC64(1.0, 127), // Sustain on at same time as note
      createCC64(2.0, 0),   // Sustain off
    ];

    const result = applySustainPedalElongation(notes, cc, 64);

    // Note should be elongated (sustain processed before note-on)
    expect(result[0].duration).toBeCloseTo(1.0); // 2.0 - 1.0 = 1.0
  });

  it("should handle empty inputs gracefully", () => {
    expect(applySustainPedalElongation([], [])).toEqual([]);
    expect(applySustainPedalElongation([], [createCC64(0, 127)])).toEqual([]);
    
    const notes = [createNote(60, 0.0, 0.5)];
    expect(applySustainPedalElongation(notes, [])).toEqual(notes);
  });
});

describe("Sustain Pedal Elongation with Safety", () => {
  it("should limit maximum elongation", () => {
    const notes = [
      createNote(60, 0.0, 0.5),
    ];
    const cc = [
      createCC64(0.0, 127), // Sustain on
      createCC64(100.0, 0), // Sustain off after 100 seconds
    ];

    const result = applySustainPedalElongationSafe(notes, cc, {
      maxElongation: 10, // Limit to 10 seconds
    });

    expect(result[0].duration).toBeCloseTo(10); // Capped at maxElongation
  });

  it("should handle invalid inputs gracefully", () => {
    const notes = [createNote(60, 0.0, 0.5)];
    
    // Invalid control changes
    const result1 = applySustainPedalElongationSafe(notes, null as any);
    expect(result1).toEqual(notes);

    // Invalid notes
    const result2 = applySustainPedalElongationSafe(null as any, []);
    expect(result2).toBeNull();
  });

  it("should filter out invalid notes after processing", () => {
    const notes = [
      createNote(60, 0.0, -0.5), // Invalid negative duration
      createNote(62, 1.0, 0.5),  // Valid note
      createNote(64, NaN, 0.5),  // Invalid NaN time
    ];
    const cc: ControlChangeEvent[] = [];

    const result = applySustainPedalElongationSafe(notes, cc, { verbose: false });

    // Should only return the valid note
    expect(result).toHaveLength(1);
    expect(result[0].midi).toBe(62);
  });
});

describe("Sustain Pedal Analysis", () => {
  it("should analyze sustain pedal usage", () => {
    const cc = [
      createCC64(0.0, 127), // Sustain on
      createCC64(1.0, 0),   // Sustain off
      createCC64(2.0, 127), // Sustain on
      createCC64(4.0, 0),   // Sustain off
    ];

    const analysis = analyzeSustainPedalUsage(cc, 64);

    expect(analysis.hasSustain).toBe(true);
    expect(analysis.sustainCount).toBe(2);
    expect(analysis.sustainRegions).toHaveLength(2);
    expect(analysis.sustainRegions[0]).toEqual({ start: 0.0, end: 1.0, duration: 1.0 });
    expect(analysis.sustainRegions[1]).toEqual({ start: 2.0, end: 4.0, duration: 2.0 });
    expect(analysis.totalSustainTime).toBeCloseTo(3.0);
    expect(analysis.averageSustainDuration).toBeCloseTo(1.5);
  });

  it("should handle no sustain pedal", () => {
    const cc: ControlChangeEvent[] = [];
    const analysis = analyzeSustainPedalUsage(cc, 64);

    expect(analysis.hasSustain).toBe(false);
    expect(analysis.sustainCount).toBe(0);
    expect(analysis.sustainRegions).toHaveLength(0);
  });

  it("should handle unclosed sustain region", () => {
    const cc = [
      createCC64(0.0, 127), // Sustain on (never released)
    ];

    const analysis = analyzeSustainPedalUsage(cc, 64);

    expect(analysis.hasSustain).toBe(true);
    expect(analysis.sustainCount).toBe(1);
    expect(analysis.sustainRegions).toHaveLength(1);
    // Should assume some end time
    expect(analysis.sustainRegions[0].start).toBe(0.0);
    expect(analysis.sustainRegions[0].duration).toBeGreaterThan(0);
  });

  it("should respect threshold in analysis", () => {
    const cc = [
      createCC64(0.0, 50),  // Below threshold
      createCC64(1.0, 100), // Above threshold
      createCC64(2.0, 30),  // Below threshold
    ];

    const analysis = analyzeSustainPedalUsage(cc, 64);

    expect(analysis.sustainCount).toBe(1);
    expect(analysis.sustainRegions[0]).toEqual({ start: 1.0, end: 2.0, duration: 1.0 });
  });
});