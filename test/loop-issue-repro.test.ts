/**
 * Tests for A-B Loop functionality using LoopManager
 * 
 * These tests validate the core loop logic:
 * - A-B loop point setting
 * - B-only loop behavior
 * - Loop clearing
 * - Position preservation
 * - Tempo scaling
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Tone.js to avoid audio context issues in tests
vi.mock("tone", () => ({
  getTransport: () => ({
    state: "stopped",
    seconds: 0,
    bpm: { value: 120 },
    loop: false,
    loopStart: 0,
    loopEnd: 10,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
  context: { state: "running" },
  getContext: () => ({
    state: "running",
    resume: vi.fn(),
    lookAhead: 0.1,
    updateInterval: 0.02,
    rawContext: { sampleRate: 44100, baseLatency: 0 },
  }),
  start: vi.fn(async () => {}),
  now: () => 0,
}));

import { LoopManager } from "@/lib/core/audio/managers/loop-manager";

describe("LoopManager A-B Loop", () => {
  let loopManager: LoopManager;
  const defaultState = {
    isPlaying: false,
    currentTime: 0,
    duration: 10,
    tempo: 120,
    originalTempo: 120,
    volume: 0.7,
    pan: 0,
    isRepeating: false,
  };

  beforeEach(() => {
    loopManager = new LoopManager(120);
  });

  describe("Setting A-B loop points", () => {
    it("should set valid A-B loop points", () => {
      const result = loopManager.setLoopPoints(2, 8, 10, defaultState as any);

      expect(result.changed).toBe(true);
      expect(loopManager.loopStartVisual).toBe(2);
      expect(loopManager.loopEndVisual).toBe(8);
      expect(loopManager.hasCustomLoop()).toBe(true);
    });

    it("should preserve position when current time is within loop bounds", () => {
      const stateWithinLoop = { ...defaultState, currentTime: 5 };
      const result = loopManager.setLoopPoints(2, 8, 10, stateWithinLoop as any);

      expect(result.shouldPreservePosition).toBe(true);
    });

    it("should not preserve position when current time is outside loop bounds", () => {
      const stateOutsideLoop = { ...defaultState, currentTime: 9 };
      const result = loopManager.setLoopPoints(2, 8, 10, stateOutsideLoop as any);

      expect(result.shouldPreservePosition).toBe(false);
    });

    it("should clamp end to duration when end exceeds duration", () => {
      const result = loopManager.setLoopPoints(2, 15, 10, defaultState as any);

      expect(loopManager.loopEndVisual).toBe(10);
    });

    it("should set end to duration when end <= start", () => {
      const result = loopManager.setLoopPoints(5, 3, 10, defaultState as any);

      expect(loopManager.loopStartVisual).toBe(5);
      expect(loopManager.loopEndVisual).toBe(10);
    });
  });

  describe("B-only loop (A=null, B=value)", () => {
    it("should create loop from 0 to B when only B is provided", () => {
      const result = loopManager.setLoopPoints(null, 5, 10, defaultState as any);

      expect(result.changed).toBe(true);
      expect(loopManager.loopStartVisual).toBe(0);
      expect(loopManager.loopEndVisual).toBe(5);
    });

    it("should clamp B to duration", () => {
      const result = loopManager.setLoopPoints(null, 15, 10, defaultState as any);

      expect(loopManager.loopEndVisual).toBe(10);
    });

    it("should preserve position when within [0, B)", () => {
      const stateWithin = { ...defaultState, currentTime: 3 };
      const result = loopManager.setLoopPoints(null, 5, 10, stateWithin as any);

      expect(result.shouldPreservePosition).toBe(true);
    });

    it("should not preserve position when outside [0, B)", () => {
      const stateOutside = { ...defaultState, currentTime: 7 };
      const result = loopManager.setLoopPoints(null, 5, 10, stateOutside as any);

      expect(result.shouldPreservePosition).toBe(false);
    });
  });

  describe("A-only loop (A=value, B=null)", () => {
    it("should NOT activate loop when only A is provided (UX policy)", () => {
      const result = loopManager.setLoopPoints(3, null, 10, defaultState as any);

      expect(result.changed).toBe(true);
      expect(loopManager.loopStartVisual).toBeNull();
      expect(loopManager.loopEndVisual).toBeNull();
      expect(loopManager.hasCustomLoop()).toBe(false);
      expect(result.shouldPreservePosition).toBe(true);
    });
  });

  describe("Clearing loop", () => {
    it("should clear loop when both A and B are null", () => {
      // First set a loop
      loopManager.setLoopPoints(2, 8, 10, defaultState as any);
      expect(loopManager.hasCustomLoop()).toBe(true);

      // Then clear it
      const result = loopManager.setLoopPoints(null, null, 10, defaultState as any);

      expect(result.changed).toBe(true);
      expect(loopManager.loopStartVisual).toBeNull();
      expect(loopManager.loopEndVisual).toBeNull();
      expect(loopManager.hasCustomLoop()).toBe(false);
    });
  });

  describe("No-change detection", () => {
    it("should return changed=false when setting same loop points", () => {
      loopManager.setLoopPoints(2, 8, 10, defaultState as any);
      const result = loopManager.setLoopPoints(2, 8, 10, defaultState as any);

      expect(result.changed).toBe(false);
    });
  });

  describe("Tempo scaling", () => {
    it("should calculate transport times based on tempo ratio", () => {
      const stateWithDifferentTempo = { ...defaultState, tempo: 240 }; // 2x speed
      const result = loopManager.setLoopPoints(2, 8, 10, stateWithDifferentTempo as any);

      // At 2x tempo, transport times should be halved
      expect(result.transportStart).toBe(1); // 2 * 120 / 240 = 1
      expect(result.transportEnd).toBe(4);   // 8 * 120 / 240 = 4
    });

    it("should rescale loop points when tempo changes", () => {
      loopManager.setLoopPoints(2, 8, 10, defaultState as any);

      // Tempo doubles: visual positions should scale
      loopManager.rescaleLoopForTempoChange(120, 240, 20);

      expect(loopManager.loopStartVisual).toBe(4);  // 2 * 2 = 4
      expect(loopManager.loopEndVisual).toBe(16);   // 8 * 2 = 16
    });

    it("should clamp rescaled loop points to duration", () => {
      loopManager.setLoopPoints(2, 8, 10, defaultState as any);

      // Tempo doubles but duration is limited
      loopManager.rescaleLoopForTempoChange(120, 240, 10);

      expect(loopManager.loopStartVisual).toBe(4);
      expect(loopManager.loopEndVisual).toBe(10); // Clamped to duration
    });
  });

  describe("Note filtering for loop", () => {
    it("should filter notes that intersect with loop window", () => {
      loopManager.setLoopPoints(2, 6, 10, defaultState as any);

      const notes = [
        { time: 0, duration: 1 },   // Ends at 1, before loop
        { time: 1, duration: 2 },   // Ends at 3, intersects loop
        { time: 3, duration: 2 },   // Fully within loop
        { time: 5, duration: 2 },   // Starts within, ends after
        { time: 7, duration: 1 },   // After loop
      ];

      const filtered = loopManager.filterNotesForLoop(notes);

      expect(filtered).toHaveLength(3);
      expect(filtered[0].time).toBe(1); // Intersects
      expect(filtered[1].time).toBe(3); // Within
      expect(filtered[2].time).toBe(5); // Starts within
    });

    it("should return all notes when no loop is active", () => {
      const notes = [
        { time: 0, duration: 1 },
        { time: 5, duration: 1 },
        { time: 9, duration: 1 },
      ];

      const filtered = loopManager.filterNotesForLoop(notes);

      expect(filtered).toHaveLength(3);
    });
  });

  describe("Note time adjustment for loop", () => {
    it("should adjust note time relative to loop start", () => {
      loopManager.setLoopPoints(2, 8, 10, defaultState as any);

      expect(loopManager.adjustNoteTimeForLoop(5)).toBe(3); // 5 - 2 = 3
      expect(loopManager.adjustNoteTimeForLoop(2)).toBe(0); // 2 - 2 = 0
    });

    it("should return original time when no loop is active", () => {
      expect(loopManager.adjustNoteTimeForLoop(5)).toBe(5);
    });
  });

  describe("Loop counter", () => {
    it("should increment counter on loop event", () => {
      loopManager.setLoopPoints(2, 8, 10, defaultState as any);

      const position1 = loopManager.handleLoopEvent();
      const position2 = loopManager.handleLoopEvent();

      expect(position1).toBe(2);
      expect(position2).toBe(2);
    });

    it("should reset counter", () => {
      loopManager.handleLoopEvent();
      loopManager.handleLoopEvent();
      loopManager.resetCounter();

      // Counter should be reset (internal state)
      // We can verify by checking that next handleLoopEvent works correctly
      const position = loopManager.handleLoopEvent();
      expect(position).toBe(0); // No loop set, returns 0
    });
  });
});
