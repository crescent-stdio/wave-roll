import { describe, it, expect } from "vitest";
import {
  buildBeatMap,
  musicalTimingEqual,
  DEFAULT_BEAT_GRID_CONFIG,
  type MusicalTimingData,
  type BeatGridConfig,
} from "@/core/visualization/piano-roll/utils/beat-map";

// ---------------------------------------------------------------------------
// Helper to create minimal timing data
// ---------------------------------------------------------------------------

function makeTiming(overrides: Partial<MusicalTimingData> = {}): MusicalTimingData {
  return {
    tempos: [{ time: 0, ticks: 0, bpm: 120 }],
    timeSignatures: [{ time: 0, ticks: 0, numerator: 4, denominator: 4 }],
    ppq: 480,
    ...overrides,
  };
}

describe("buildBeatMap", () => {
  it("returns empty array for null-like timing", () => {
    const result = buildBeatMap({ tempos: [], timeSignatures: [], ppq: 480 }, 10);
    expect(result).toEqual([]);
  });

  it("generates correct markers for 120 BPM 4/4", () => {
    const timing = makeTiming();
    const markers = buildBeatMap(timing, 4, DEFAULT_BEAT_GRID_CONFIG);

    // 120 BPM => 0.5s per beat, 4/4 => 4 beats per measure => 2s per measure
    // In 4 seconds: 2 full measures = 8 beats + beat 1 of measure 3 at t=4
    expect(markers.length).toBeGreaterThanOrEqual(8);

    // First marker at t=0, measure 1, beat 1
    expect(markers[0].time).toBe(0);
    expect(markers[0].measure).toBe(1);
    expect(markers[0].beat).toBe(1);
    expect(markers[0].isMeasureStart).toBe(true);

    // Second marker at t=0.5
    expect(markers[1].time).toBeCloseTo(0.5, 6);
    expect(markers[1].beat).toBe(2);
    expect(markers[1].isMeasureStart).toBe(false);
    expect(markers[1].label).toBe("1.2");

    // Measure 2 starts at t=2.0
    const m2Start = markers.find((m) => m.measure === 2 && m.beat === 1);
    expect(m2Start).toBeDefined();
    expect(m2Start!.time).toBeCloseTo(2.0, 6);
    expect(m2Start!.isMeasureStart).toBe(true);
    expect(m2Start!.label).toBe("2");
  });

  it("handles tempo change (120 -> 60 BPM)", () => {
    const timing = makeTiming({
      tempos: [
        { time: 0, ticks: 0, bpm: 120 },
        { time: 2, ticks: 960, bpm: 60 },
      ],
    });

    const markers = buildBeatMap(timing, 6, DEFAULT_BEAT_GRID_CONFIG);

    // Before tempo change (120 BPM): beats at 0, 0.5, 1.0, 1.5, 2.0
    // After tempo change (60 BPM): beats at 2.0, 3.0, 4.0, 5.0, 6.0
    const markersAfterChange = markers.filter((m) => m.time >= 2.0 - 1e-9);

    // After change, spacing should be ~1.0s (60 BPM)
    const spacings: number[] = [];
    for (let i = 1; i < markersAfterChange.length; i++) {
      spacings.push(markersAfterChange[i].time - markersAfterChange[i - 1].time);
    }
    // All spacings after change should be ~1.0s
    for (const s of spacings) {
      expect(s).toBeCloseTo(1.0, 4);
    }
  });

  it("handles time signature change (4/4 -> 3/4)", () => {
    const timing = makeTiming({
      timeSignatures: [
        { time: 0, ticks: 0, numerator: 4, denominator: 4 },
        { time: 2, ticks: 960, numerator: 3, denominator: 4 },
      ],
    });

    const markers = buildBeatMap(timing, 5, DEFAULT_BEAT_GRID_CONFIG);

    // After time signature change at t=2, measures should have 3 beats
    const markersAfterChange = markers.filter((m) => m.time >= 2.0 - 1e-9);
    const measureStarts = markersAfterChange.filter((m) => m.isMeasureStart);

    // The first measure start after change should have the time sig label
    const firstAfterChange = measureStarts[0];
    expect(firstAfterChange).toBeDefined();
    expect(firstAfterChange!.timeSignature.numerator).toBe(3);
    expect(firstAfterChange!.timeSignature.denominator).toBe(4);

    // Check that measures after change have only 3 beats
    if (measureStarts.length >= 2) {
      const m1 = measureStarts[0];
      const m2 = measureStarts[1];
      // 3 beats * 0.5s = 1.5s between measure starts
      expect(m2.time - m1.time).toBeCloseTo(1.5, 4);
    }
  });

  it("maintains floating-point precision at beat 1000", () => {
    const timing = makeTiming({
      tempos: [{ time: 0, ticks: 0, bpm: 120 }],
    });
    // 120 BPM = 0.5s per beat, beat 1000 should be at 499.5s
    const maxTime = 500;
    const markers = buildBeatMap(timing, maxTime, DEFAULT_BEAT_GRID_CONFIG);

    // Find a marker near beat index 999 (0-based), which is t = 999 * 0.5 = 499.5
    const target = markers.find((m) => Math.abs(m.time - 499.5) < 0.01);
    expect(target).toBeDefined();
    expect(Math.abs(target!.time - 499.5)).toBeLessThan(0.001);
  });

  it("respects maxTimeSeconds boundary", () => {
    const timing = makeTiming();
    const markers = buildBeatMap(timing, 1.0, DEFAULT_BEAT_GRID_CONFIG);

    // All markers should be <= maxTime
    for (const m of markers) {
      expect(m.time).toBeLessThanOrEqual(1.0 + 1e-9);
    }
  });

  it("measures-only resolution filters out beat markers", () => {
    const timing = makeTiming();
    const config: BeatGridConfig = {
      resolution: "measures",
      subdivisionFactor: 2,
      showTimeSignatureLabel: true,
    };
    const markers = buildBeatMap(timing, 4, config);

    // All markers should be measure starts
    for (const m of markers) {
      expect(m.isMeasureStart).toBe(true);
      expect(m.beat).toBe(1);
    }
  });
});

describe("musicalTimingEqual", () => {
  it("returns true for identical references", () => {
    const t = makeTiming();
    expect(musicalTimingEqual(t, t)).toBe(true);
  });

  it("returns true for structurally equal data", () => {
    const a = makeTiming();
    const b = makeTiming();
    expect(musicalTimingEqual(a, b)).toBe(true);
  });

  it("returns false when ppq differs", () => {
    const a = makeTiming();
    const b = makeTiming({ ppq: 960 });
    expect(musicalTimingEqual(a, b)).toBe(false);
  });

  it("returns false when tempo differs", () => {
    const a = makeTiming();
    const b = makeTiming({
      tempos: [{ time: 0, ticks: 0, bpm: 60 }],
    });
    expect(musicalTimingEqual(a, b)).toBe(false);
  });

  it("handles null inputs", () => {
    expect(musicalTimingEqual(null, null)).toBe(true);
    expect(musicalTimingEqual(makeTiming(), null)).toBe(false);
    expect(musicalTimingEqual(null, makeTiming())).toBe(false);
  });
});
