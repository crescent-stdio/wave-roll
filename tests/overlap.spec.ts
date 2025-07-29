import { describe, it, expect } from "vitest";
import { groupOverlappingNotes } from "@/lib/core/midi/overlap";
import { NoteData } from "@/lib/midi/types";

// Helper to build a NoteData stub
const note = (midi: number, time: number, duration = 1): NoteData =>
  ({
    midi,
    time,
    duration,
    velocity: 1,
    ticks: 0,
    name: "",
    pitch: "",
    octave: 0,
  }) as any;

describe("groupOverlappingNotes", () => {
  it("detects exact two-way overlaps", () => {
    const files = [[note(60, 0)], [note(60, 0)]];
    const res = groupOverlappingNotes(files);
    expect(res.length).toBe(1);
    expect(res[0].pitch).toBe(60);
    expect(res[0].fileIndices.sort()).toEqual([0, 1]);
  });

  it("detects fuzzy overlaps within tolerance", () => {
    const files = [
      [note(60, 0)],
      [note(60.4, 0.02)], // within default tolerances
    ];
    const res = groupOverlappingNotes(files);
    expect(res.length).toBe(1);
  });

  it("ignores notes outside tolerance", () => {
    const files = [
      [note(60, 0)],
      [note(62, 0.2)], // outside tolerance
    ];
    const res = groupOverlappingNotes(files);
    expect(res.length).toBe(0);
  });

  it("handles three-way overlaps", () => {
    const files = [[note(60, 0)], [note(60, 0)], [note(60, 0)]];
    const res = groupOverlappingNotes(files);
    expect(res.length).toBe(1);
    expect(res[0].fileIndices.length).toBe(3);
  });
});
