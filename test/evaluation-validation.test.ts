/**
 * Comprehensive test suite for mir_eval-compatible piano roll splitting validation
 *
 * This test suite validates that the piano roll splitting and note matching
 * system works correctly according to mir_eval standards.
 *
 * Tests include:
 * 1. Note matching accuracy (TP, FP, FN)
 * 2. Segment splitting correctness
 * 3. Visual consistency
 * 4. Performance metrics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EvaluationHandler } from '@/lib/components/player/wave-roll/evaluation-handler';
import { StateManager } from '@/lib/core/state';
import { matchNotes } from '@/lib/evaluation/transcription';
import { createMockMidi } from './utils/mock-midi';
import type { ParsedMidi } from '@/lib/midi/types';
import type { ColoredNote } from '@/lib/core/visualization/types';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    matchingAccuracy: number;
    segmentCoverage: number;
    visualConsistency: number;
    performance: {
      matchingTime: number;
      splittingTime: number;
      memoryUsage?: number;
    };
  };
}

interface SegmentValidationData {
  originalNote: any;
  segments: ColoredNote[];
  expectedSegmentTypes: ('intersection' | 'exclusive' | 'ambiguous')[];
  tolerance: number;
}

describe('Piano Roll Splitting Validation', () => {
  let stateManager: StateManager;
  let evaluationHandler: EvaluationHandler;

  beforeEach(() => {
    stateManager = new StateManager();
    evaluationHandler = new EvaluationHandler(stateManager);
  });

  describe('Note Matching Accuracy', () => {
    it('should correctly identify true positives with onset/pitch/offset matching', () => {
      // Create reference MIDI with known notes
      const reference = createMockMidi([
        { time: 0.0, duration: 1.0, midi: 60, velocity: 80 },
        { time: 1.0, duration: 0.5, midi: 64, velocity: 90 },
        { time: 2.0, duration: 2.0, midi: 67, velocity: 75 }
      ]);

      // Create estimated MIDI with slight variations but should match
      const estimated = createMockMidi([
        { time: 0.05, duration: 0.95, midi: 60, velocity: 82 }, // Slight onset/offset diff
        { time: 1.02, duration: 0.48, midi: 64, velocity: 88 }, // Slight variations
        { time: 3.0, duration: 1.0, midi: 72, velocity: 70 }     // Different note (FP)
      ]);

      const tolerances = {
        onsetTolerance: 0.1,
        pitchTolerance: 0.5,
        offsetRatioTolerance: 0.2,
        offsetMinTolerance: 0.05
      };

      const matchResult = matchNotes(reference, estimated, tolerances);

      // Should have 2 matches (first two notes)
      expect(matchResult.matches).toHaveLength(2);

      // Check specific matches
      const match1 = matchResult.matches.find(m => m.ref === 0);
      const match2 = matchResult.matches.find(m => m.ref === 1);

      expect(match1).toBeDefined();
      expect(match1?.est).toBe(0);
      expect(match1?.refPitch).toBe(60);
      expect(match1?.estPitch).toBe(60);

      expect(match2).toBeDefined();
      expect(match2?.est).toBe(1);
      expect(match2?.refPitch).toBe(64);
      expect(match2?.estPitch).toBe(64);

      // Check false negatives and false positives
      expect(matchResult.falseNegatives).toEqual([2]); // Third reference note unmatched
      expect(matchResult.falsePositives).toEqual([2]); // Third estimated note unmatched
    });

    it('should respect tolerance parameters correctly', () => {
      const reference = createMockMidi([
        { time: 0.0, duration: 1.0, midi: 60, velocity: 80 }
      ]);

      // Test with strict tolerances
      const estimatedStrict = createMockMidi([
        { time: 0.2, duration: 1.0, midi: 60, velocity: 80 } // 0.2s onset difference
      ]);

      const strictTolerances = {
        onsetTolerance: 0.1,  // Stricter than 0.2s difference
        pitchTolerance: 0.5,
        offsetRatioTolerance: 0.2,
        offsetMinTolerance: 0.05
      };

      const strictResult = matchNotes(reference, estimatedStrict, strictTolerances);
      expect(strictResult.matches).toHaveLength(0); // Should not match

      // Test with loose tolerances
      const looseTolerances = {
        onsetTolerance: 0.3,  // Looser than 0.2s difference
        pitchTolerance: 0.5,
        offsetRatioTolerance: 0.2,
        offsetMinTolerance: 0.05
      };

      const looseResult = matchNotes(reference, estimatedStrict, looseTolerances);
      expect(looseResult.matches).toHaveLength(1); // Should match
    });
  });

  describe('Segment Splitting Correctness', () => {
    it('should split matched notes into correct intersection and exclusive segments', () => {
      // Setup evaluation state
      const refMidi = createMockMidi([
        { time: 0.0, duration: 2.0, midi: 60, velocity: 80 }
      ]);

      const estMidi = createMockMidi([
        { time: 0.5, duration: 1.0, midi: 60, velocity: 85 } // Overlaps from 0.5-1.5
      ]);

      stateManager.updateEvaluationState({
        refId: 'ref',
        estIds: ['est'],
        onsetTolerance: 0.1,
        pitchTolerance: 0.5,
        offsetRatioTolerance: 0.2,
        offsetMinTolerance: 0.05
      });

      const state = {
        files: [
          { id: 'ref', parsedData: refMidi, color: '#ff0000' },
          { id: 'est', parsedData: estMidi, color: '#0000ff' }
        ]
      };

      const baseNotes: ColoredNote[] = [
        {
          note: { ...refMidi.notes[0], sourceIndex: 0 },
          color: 0xff0000,
          fileId: 'ref',
          isMuted: false
        }
      ];

      const result = evaluationHandler.getEvaluationColoredNotes(
        state,
        baseNotes,
        'eval-match-intersection-own'
      );

      // Validate segments
      const validation = validateSegmentSplitting({
        originalNote: refMidi.notes[0],
        segments: result.filter(r => r.fileId === 'ref'),
        expectedSegmentTypes: ['exclusive', 'intersection', 'exclusive'],
        tolerance: 0.001
      });

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Check specific segment boundaries
      const segments = result.filter(r => r.fileId === 'ref').sort((a, b) => a.note.time - b.note.time);

      expect(segments).toHaveLength(3);

      // First segment: 0.0 - 0.5 (exclusive)
      expect(segments[0].note.time).toBeCloseTo(0.0, 3);
      expect(segments[0].note.duration).toBeCloseTo(0.5, 3);
      expect(segments[0].note.evalSegmentKind).toBe('exclusive');

      // Second segment: 0.5 - 1.5 (intersection)
      expect(segments[1].note.time).toBeCloseTo(0.5, 3);
      expect(segments[1].note.duration).toBeCloseTo(1.0, 3);
      expect(segments[1].note.evalSegmentKind).toBe('intersection');

      // Third segment: 1.5 - 2.0 (exclusive)
      expect(segments[2].note.time).toBeCloseTo(1.5, 3);
      expect(segments[2].note.duration).toBeCloseTo(0.5, 3);
      expect(segments[2].note.evalSegmentKind).toBe('exclusive');
    });

    it('should preserve total duration when splitting notes', () => {
      const originalNote = { time: 0.0, duration: 3.0, midi: 60, velocity: 80 };
      const refMidi = createMockMidi([originalNote]);
      const estMidi = createMockMidi([
        { time: 1.0, duration: 1.0, midi: 60, velocity: 85 } // Partial overlap
      ]);

      stateManager.updateEvaluationState({
        refId: 'ref',
        estIds: ['est'],
        onsetTolerance: 0.1,
        pitchTolerance: 0.5,
        offsetRatioTolerance: 0.2,
        offsetMinTolerance: 0.05
      });

      const state = {
        files: [
          { id: 'ref', parsedData: refMidi, color: '#ff0000' },
          { id: 'est', parsedData: estMidi, color: '#0000ff' }
        ]
      };

      const baseNotes: ColoredNote[] = [
        {
          note: { ...originalNote, sourceIndex: 0 },
          color: 0xff0000,
          fileId: 'ref',
          isMuted: false
        }
      ];

      const result = evaluationHandler.getEvaluationColoredNotes(
        state,
        baseNotes,
        'eval-match-intersection-own'
      );

      const refSegments = result.filter(r => r.fileId === 'ref');
      const totalDuration = refSegments.reduce((sum, seg) => sum + seg.note.duration, 0);

      expect(totalDuration).toBeCloseTo(originalNote.duration, 3);
    });
  });

  describe('Visual Consistency', () => {
    it('should apply correct colors for different highlight modes', () => {
      const refMidi = createMockMidi([
        { time: 0.0, duration: 1.0, midi: 60, velocity: 80 }
      ]);

      const estMidi = createMockMidi([
        { time: 0.2, duration: 0.6, midi: 60, velocity: 85 }
      ]);

      stateManager.updateEvaluationState({
        refId: 'ref',
        estIds: ['est'],
        onsetTolerance: 0.3,
        pitchTolerance: 0.5,
        offsetRatioTolerance: 0.2,
        offsetMinTolerance: 0.05
      });

      const state = {
        files: [
          { id: 'ref', parsedData: refMidi, color: '#ff0000' },
          { id: 'est', parsedData: estMidi, color: '#0000ff' }
        ]
      };

      const baseNotes: ColoredNote[] = [
        {
          note: { ...refMidi.notes[0], sourceIndex: 0 },
          color: 0xff0000,
          fileId: 'ref',
          isMuted: false
        }
      ];

      // Test different highlight modes
      const modes = [
        'eval-match-intersection-own',
        'eval-exclusive-intersection-own',
        'eval-tp-only-gray',
        'eval-gt-missed-only-gray'
      ];

      for (const mode of modes) {
        const result = evaluationHandler.getEvaluationColoredNotes(
          state,
          baseNotes,
          mode
        );

        // Basic validation: should have at least one segment
        expect(result.length).toBeGreaterThan(0);

        // All segments should have valid colors
        for (const segment of result) {
          expect(typeof segment.color).toBe('number');
          expect(segment.color).toBeGreaterThanOrEqual(0);
          expect(segment.color).toBeLessThanOrEqual(0xFFFFFF);
        }

        // Segments should have valid eval flags when in eval modes
        const evalSegments = result.filter(r => r.note.isEvalHighlightSegment);
        if (mode.startsWith('eval-')) {
          expect(evalSegments.length).toBeGreaterThan(0);

          for (const evalSeg of evalSegments) {
            expect(['intersection', 'exclusive', 'ambiguous']).toContain(
              evalSeg.note.evalSegmentKind
            );
          }
        }
      }
    });
  });

  describe('Performance Metrics', () => {
    it('should complete matching and splitting within acceptable time limits', () => {
      // Create larger test case
      const refNotes = Array.from({ length: 100 }, (_, i) => ({
        time: i * 0.5,
        duration: 0.4,
        midi: 60 + (i % 12),
        velocity: 80
      }));

      const estNotes = Array.from({ length: 95 }, (_, i) => ({
        time: i * 0.5 + 0.05, // Slight offset
        duration: 0.35,
        midi: 60 + (i % 12),
        velocity: 85
      }));

      const refMidi = createMockMidi(refNotes);
      const estMidi = createMockMidi(estNotes);

      stateManager.updateEvaluationState({
        refId: 'ref',
        estIds: ['est'],
        onsetTolerance: 0.1,
        pitchTolerance: 0.5,
        offsetRatioTolerance: 0.2,
        offsetMinTolerance: 0.05
      });

      const state = {
        files: [
          { id: 'ref', parsedData: refMidi, color: '#ff0000' },
          { id: 'est', parsedData: estMidi, color: '#0000ff' }
        ]
      };

      const baseNotes: ColoredNote[] = refNotes.map((note, i) => ({
        note: { ...note, sourceIndex: i },
        color: 0xff0000,
        fileId: 'ref',
        isMuted: false
      }));

      // Measure performance
      const startTime = performance.now();

      const result = evaluationHandler.getEvaluationColoredNotes(
        state,
        baseNotes,
        'eval-match-intersection-own'
      );

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      // Performance assertions
      expect(executionTime).toBeLessThan(1000); // Should complete within 1 second
      expect(result.length).toBeGreaterThan(0);

      console.log(`Performance test: ${executionTime.toFixed(2)}ms for 100 reference notes`);
    });
  });
});

/**
 * Validates that note segments are correctly split and maintain consistency
 */
function validateSegmentSplitting(data: SegmentValidationData): ValidationResult {
  const { originalNote, segments, expectedSegmentTypes, tolerance } = data;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check total duration preservation
  const totalSegmentDuration = segments.reduce((sum, seg) => sum + seg.note.duration, 0);
  if (Math.abs(totalSegmentDuration - originalNote.duration) > tolerance) {
    errors.push(
      `Total segment duration (${totalSegmentDuration}) does not match original (${originalNote.duration})`
    );
  }

  // Check segment continuity
  const sortedSegments = segments.slice().sort((a, b) => a.note.time - b.note.time);
  for (let i = 0; i < sortedSegments.length - 1; i++) {
    const current = sortedSegments[i];
    const next = sortedSegments[i + 1];
    const currentEnd = current.note.time + current.note.duration;

    if (Math.abs(currentEnd - next.note.time) > tolerance) {
      errors.push(
        `Gap between segments at ${currentEnd} and ${next.note.time}`
      );
    }
  }

  // Check segment types if provided
  if (expectedSegmentTypes.length > 0) {
    if (sortedSegments.length !== expectedSegmentTypes.length) {
      errors.push(
        `Expected ${expectedSegmentTypes.length} segments, got ${sortedSegments.length}`
      );
    } else {
      for (let i = 0; i < sortedSegments.length; i++) {
        const segment = sortedSegments[i];
        const expected = expectedSegmentTypes[i];

        if (segment.note.evalSegmentKind !== expected) {
          errors.push(
            `Segment ${i} has type '${segment.note.evalSegmentKind}', expected '${expected}'`
          );
        }
      }
    }
  }

  // Calculate metrics
  const matchingAccuracy = errors.length === 0 ? 1.0 : 0.0;
  const segmentCoverage = totalSegmentDuration / originalNote.duration;
  const visualConsistency = segments.every(s => typeof s.color === 'number') ? 1.0 : 0.0;

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      matchingAccuracy,
      segmentCoverage,
      visualConsistency,
      performance: {
        matchingTime: 0, // Will be filled by caller
        splittingTime: 0 // Will be filled by caller
      }
    }
  };
}