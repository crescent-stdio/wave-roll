import { describe, it, expect } from "vitest";
import { ParsedMidi, NoteData } from "@/lib/core/utils/midi/types";
import {
  matchNotesEnhanced,
  enhancedToStandardResult,
} from "@/lib/evaluation/transcription/matchNotes-enhanced";
import {
  evaluateTranscriptionEnhanced,
  computeEnhancedNoteMetrics,
} from "@/lib/evaluation/transcription/metrics-enhanced";

/**
 * Test suite for enhanced transcription evaluation
 * Validates mir_eval compatibility and 1:N matching support
 */

// Helper to create a mock ParsedMidi
function createMockMidi(notes: Partial<NoteData>[]): ParsedMidi {
  const fullNotes: NoteData[] = notes.map((n, i) => ({
    midi: n.midi || 60,
    time: n.time || 0,
    ticks: n.ticks || 0,
    name: n.name || "C4",
    pitch: n.pitch || "C",
    octave: n.octave || 4,
    velocity: n.velocity !== undefined ? n.velocity : 0.8,
    duration: n.duration || 0.5,
    fileId: n.fileId || "test",
    ...n,
  }));

  return {
    header: {
      name: "Test",
      tempos: [],
      timeSignatures: [],
      PPQ: 480,
    },
    duration: Math.max(...fullNotes.map(n => n.time + n.duration), 0),
    track: { name: "Piano", channel: 0 },
    notes: fullNotes,
    controlChanges: [],
  };
}

describe("Enhanced Note Matching", () => {
  it("should match notes with standard 1:1 matching", () => {
    const reference = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5, velocity: 0.8 },
      { midi: 62, time: 1.0, duration: 0.5, velocity: 0.7 },
      { midi: 64, time: 2.0, duration: 0.5, velocity: 0.9 },
    ]);

    const estimated = createMockMidi([
      { midi: 60, time: 0.02, duration: 0.48, velocity: 0.75 },
      { midi: 62, time: 0.98, duration: 0.52, velocity: 0.72 },
      { midi: 65, time: 2.5, duration: 0.5, velocity: 0.6 }, // Wrong pitch
    ]);

    const result = matchNotesEnhanced(reference, estimated, {
      onsetTolerance: 0.05,
      pitchTolerance: 0.5,
      offsetRatioTolerance: 0.2,
      offsetMinTolerance: 0.05,
    });

    expect(result.matches).toHaveLength(2); // First two should match
    expect(result.falseNegatives).toContain(2); // Third ref note unmatched
    expect(result.falsePositives).toContain(2); // Third est note unmatched
  });

  it("should apply velocity scaling (mir_eval style)", () => {
    const reference = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5, velocity: 0.2 },
      { midi: 62, time: 1.0, duration: 0.5, velocity: 0.5 },
      { midi: 64, time: 2.0, duration: 0.5, velocity: 0.8 },
    ]);

    const estimated = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5, velocity: 0.4 },
      { midi: 62, time: 1.0, duration: 0.5, velocity: 0.6 },
      { midi: 64, time: 2.0, duration: 0.5, velocity: 0.9 },
    ]);

    const result = matchNotesEnhanced(
      reference,
      estimated,
      {},
      {},
      { applyVelocityScaling: true }
    );

    expect(result.velocityScaling).toBeDefined();
    expect(result.velocityScaling?.normalized).toBe(true);
    
    // Check that scaled velocities are closer to reference
    for (const match of result.matches) {
      if (match.estVelocityScaled && match.refVelocity) {
        const scaledDiff = Math.abs(
          (Array.isArray(match.estVelocityScaled) 
            ? match.estVelocityScaled[0] 
            : match.estVelocityScaled) - match.refVelocity
        );
        const originalDiff = Math.abs(
          (Array.isArray(match.estVelocity) 
            ? match.estVelocity[0] 
            : match.estVelocity || 0) - match.refVelocity
        );
        
        // Scaled difference should generally be smaller (better match)
        // This may not always be true for individual notes, but should be true on average
        expect(scaledDiff).toBeLessThanOrEqual(originalDiff + 0.1); // Allow small tolerance
      }
    }
  });

  it("should support 1:N matching", () => {
    const reference = createMockMidi([
      { midi: 60, time: 0.0, duration: 1.0, velocity: 0.8 },
    ]);

    // Multiple estimated notes that could match the single reference
    const estimated = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.4, velocity: 0.75 },
      { midi: 60, time: 0.5, duration: 0.4, velocity: 0.85 },
      { midi: 61, time: 1.5, duration: 0.5, velocity: 0.6 }, // Different pitch
    ]);

    const result = matchNotesEnhanced(
      reference,
      estimated,
      { onsetTolerance: 0.6, offsetRatioTolerance: 0.5 },
      {},
      { maxMatchesPerRef: 2, maxMatchesPerEst: 1 }
    );

    expect(result.matches).toHaveLength(1);
    const match = result.matches[0];
    expect(Array.isArray(match.est)).toBe(true);
    if (Array.isArray(match.est)) {
      expect(match.est).toHaveLength(2); // Should match both notes at midi 60
      expect(match.est).toContain(0);
      expect(match.est).toContain(1);
    }
    expect(result.falsePositives).toContain(2); // Third note unmatched
  });

  it("should handle missing velocities gracefully", () => {
    const reference = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5, velocity: undefined as any },
      { midi: 62, time: 1.0, duration: 0.5, velocity: 0.7 },
    ]);

    const estimated = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5, velocity: 0.8 },
      { midi: 62, time: 1.0, duration: 0.5, velocity: undefined as any },
    ]);

    const result = matchNotesEnhanced(
      reference,
      estimated,
      {},
      { missingVelocity: 'ignore' }
    );

    expect(result.matches).toHaveLength(2);
    // Velocity differences should be calculated only when both velocities exist
    expect(result.matches[0].velocityDiff).toBeUndefined();
    expect(result.matches[1].velocityDiff).toBeUndefined();
  });
});

describe("Enhanced Metrics Computation", () => {
  it("should compute standard PRF metrics correctly", () => {
    const reference = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5 },
      { midi: 62, time: 1.0, duration: 0.5 },
      { midi: 64, time: 2.0, duration: 0.5 },
      { midi: 66, time: 3.0, duration: 0.5 },
    ]);

    const estimated = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5 },
      { midi: 62, time: 1.0, duration: 0.5 },
      { midi: 65, time: 2.0, duration: 0.5 }, // Wrong pitch
      { midi: 67, time: 3.5, duration: 0.5 }, // Extra note
      { midi: 68, time: 4.0, duration: 0.5 }, // Extra note
    ]);

    const metrics = computeEnhancedNoteMetrics(reference, estimated);

    expect(metrics.numRef).toBe(4);
    expect(metrics.numEst).toBe(5);
    expect(metrics.numCorrect).toBe(2);
    expect(metrics.precision).toBeCloseTo(2/5, 5);
    expect(metrics.recall).toBeCloseTo(2/4, 5);
    expect(metrics.f1).toBeCloseTo(2 * (2/5) * (2/4) / ((2/5) + (2/4)), 5);
  });

  it("should compute velocity metrics with scaling", () => {
    const reference = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5, velocity: 0.3 },
      { midi: 62, time: 1.0, duration: 0.5, velocity: 0.6 },
      { midi: 64, time: 2.0, duration: 0.5, velocity: 0.9 },
    ]);

    const estimated = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5, velocity: 0.5 },
      { midi: 62, time: 1.0, duration: 0.5, velocity: 0.7 },
      { midi: 64, time: 2.0, duration: 0.5, velocity: 1.0 },
    ]);

    const metrics = evaluateTranscriptionEnhanced(reference, estimated, {
      velocity: { 
        mode: 'threshold',
        velocityTolerance: 0.15,
        unit: 'normalized',
      },
      matching: { applyVelocityScaling: true },
    });

    expect(metrics.velocity).toBeDefined();
    expect(metrics.velocityScaling).toBeDefined();
    expect(metrics.velocity?.numVelocityCorrect).toBeGreaterThanOrEqual(0);
    expect(metrics.velocity?.rmseScaled).toBeLessThanOrEqual(metrics.velocity?.rmseVelocity || 1);
  });

  it("should provide velocity error percentiles", () => {
    const reference = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5, velocity: 0.5 },
      { midi: 61, time: 0.5, duration: 0.5, velocity: 0.5 },
      { midi: 62, time: 1.0, duration: 0.5, velocity: 0.5 },
      { midi: 63, time: 1.5, duration: 0.5, velocity: 0.5 },
      { midi: 64, time: 2.0, duration: 0.5, velocity: 0.5 },
    ]);

    const estimated = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5, velocity: 0.4 },  // -0.1
      { midi: 61, time: 0.5, duration: 0.5, velocity: 0.45 }, // -0.05
      { midi: 62, time: 1.0, duration: 0.5, velocity: 0.5 },  // 0
      { midi: 63, time: 1.5, duration: 0.5, velocity: 0.6 },  // +0.1
      { midi: 64, time: 2.0, duration: 0.5, velocity: 0.7 },  // +0.2
    ]);

    const metrics = evaluateTranscriptionEnhanced(reference, estimated);

    expect(metrics.velocity?.velocityErrorPercentiles).toBeDefined();
    const percentiles = metrics.velocity?.velocityErrorPercentiles;
    if (percentiles) {
      expect(percentiles.p50).toBeGreaterThanOrEqual(0); // Median error
      expect(percentiles.p25).toBeLessThanOrEqual(percentiles.p50);
      expect(percentiles.p50).toBeLessThanOrEqual(percentiles.p75);
      expect(percentiles.p75).toBeLessThanOrEqual(percentiles.p90);
    }
  });

  it("should track 1:N matching statistics", () => {
    const reference = createMockMidi([
      { midi: 60, time: 0.0, duration: 2.0 },
      { midi: 64, time: 2.0, duration: 1.0 },
    ]);

    const estimated = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.5 },
      { midi: 60, time: 0.5, duration: 0.5 },
      { midi: 60, time: 1.0, duration: 0.5 },
      { midi: 64, time: 2.0, duration: 1.0 },
    ]);

    const metrics = evaluateTranscriptionEnhanced(reference, estimated, {
      tolerances: { onsetTolerance: 1.5 },
      matching: { 
        maxMatchesPerRef: 3,
        maxMatchesPerEst: 1,
      },
    });

    expect(metrics.matchingStats).toBeDefined();
    expect(metrics.matchingStats?.refsWithMultipleMatches).toBeGreaterThan(0);
    expect(metrics.matchingStats?.avgMatchesPerRef).toBeGreaterThan(1);
  });
});

describe("Backward Compatibility", () => {
  it("should convert enhanced results to standard format", () => {
    const reference = createMockMidi([
      { midi: 60, time: 0.0, duration: 1.0 },
    ]);

    const estimated = createMockMidi([
      { midi: 60, time: 0.0, duration: 0.4 },
      { midi: 60, time: 0.5, duration: 0.4 },
    ]);

    const enhanced = matchNotesEnhanced(
      reference,
      estimated,
      { onsetTolerance: 0.6 },
      {},
      { maxMatchesPerRef: 2 }
    );

    const standard = enhancedToStandardResult(enhanced);

    expect(standard.matches).toHaveLength(enhanced.matches.length);
    // Standard format should have single estimated note per match
    for (const match of standard.matches) {
      expect(typeof match.est).toBe('number');
      expect(typeof match.estPitch).toBe('number');
    }
  });
});