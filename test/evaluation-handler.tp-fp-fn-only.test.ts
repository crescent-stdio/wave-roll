/**
 * Unit tests for TP/FP/FN-only highlight modes.
 *
 * Note: The actual implementation splits notes into multiple segments
 * (intersection, exclusive, non-selected, etc.) and returns all of them.
 * These tests verify:
 * - TP-only: intersection segments are marked with isEvalHighlightSegment=true
 * - FN-only: REF exclusive (FN) segments are marked with isEvalHighlightSegment=true
 * - FP-only: EST exclusive (FP) segments are marked with isEvalHighlightSegment=true
 */
import { describe, it, expect } from 'vitest';
import { EvaluationHandler } from '@/lib/components/player/wave-roll/evaluation-handler';
import { StateManager } from '@/lib/core/state';
import type { ColoredNote } from '@/lib/core/visualization/visualization-engine';

describe('EvaluationHandler TP/FP/FN-only modes', () => {
  const refId = 'ref';
  const estId = 'est';
  const refColor = 0x3366ff;
  const estColor = 0xff3366;

  const baseState = {
    files: [
      {
        id: refId,
        color: refColor,
        parsedData: { notes: [
          { midi: 60, time: 0.0, duration: 1.0, velocity: 0.8 }, // overlaps with est
          { midi: 62, time: 2.0, duration: 0.5, velocity: 0.8 }, // ref-only (FN)
        ] },
        isPianoRollVisible: true,
      },
      {
        id: estId,
        color: estColor,
        parsedData: { notes: [
          { midi: 60, time: 0.5, duration: 0.5, velocity: 0.7 }, // overlaps with ref
          { midi: 64, time: 3.0, duration: 0.5, velocity: 0.7 }, // est-only (FP)
        ] },
        isPianoRollVisible: true,
      },
    ],
  } as any;

  const baseNotes: ColoredNote[] = [
    { note: { midi: 60, time: 0.0, duration: 1.0, velocity: 0.8, fileId: refId, sourceIndex: 0 } as any, color: refColor, fileId: refId, isMuted: false },
    { note: { midi: 62, time: 2.0, duration: 0.5, velocity: 0.8, fileId: refId, sourceIndex: 1 } as any, color: refColor, fileId: refId, isMuted: false },
    { note: { midi: 60, time: 0.5, duration: 0.5, velocity: 0.7, fileId: estId, sourceIndex: 0 } as any, color: estColor, fileId: estId, isMuted: false },
    { note: { midi: 64, time: 3.0, duration: 0.5, velocity: 0.7, fileId: estId, sourceIndex: 1 } as any, color: estColor, fileId: estId, isMuted: false },
  ];

  function setupSM() {
    const sm = new StateManager();
    sm.updateEvaluationState({
      refId,
      estIds: [estId],
      onsetTolerance: 1.0,
      pitchTolerance: 0.5,
      offsetRatioTolerance: 0.2,
      offsetMinTolerance: 0.05,
    } as any);
    return sm;
  }

  it('eval-tp-only-own: highlights intersection segments', () => {
    const sm = setupSM();
    const eh = new EvaluationHandler(sm as any);
    const out = eh.getEvaluationColoredNotes(baseState, baseNotes, 'eval-tp-only-own');
    // Implementation returns all notes split into segments.
    // Check that intersection segments (TP) are marked with isEvalHighlightSegment=true
    // and evalSegmentKind='intersection'
    expect(out.length).toBeGreaterThanOrEqual(1);
    const tpSegments = out.filter(n => n.note.isEvalHighlightSegment && n.note.evalSegmentKind === 'intersection');
    expect(tpSegments.length).toBeGreaterThanOrEqual(1);
    // Intersection should be around [0.5..1.0] for midi 60
    expect(tpSegments.some(n => n.note.midi === 60 && n.note.time >= 0.5 - 1e-6 && n.note.time + n.note.duration <= 1.0 + 1e-6)).toBe(true);
  });

  it('eval-fn-only-gray: highlights REF exclusive (FN) segments', () => {
    const sm = setupSM();
    const eh = new EvaluationHandler(sm as any);
    const out = eh.getEvaluationColoredNotes(baseState, baseNotes, 'eval-fn-only-gray');
    // FN-only mode: REF exclusive segments should be highlighted
    // REF note midi 62 [2.0..2.5] is entirely unmatched (FN)
    // REF note midi 60 [0.0..0.5] portion before intersection is also FN
    const refNotes = out.filter(n => n.fileId === refId);
    expect(refNotes.length).toBeGreaterThanOrEqual(2);
    // Check that FN (exclusive) segments exist for REF
    const fnSegments = refNotes.filter(n => n.note.isEvalHighlightSegment && n.note.evalSegmentKind === 'exclusive');
    expect(fnSegments.length).toBeGreaterThanOrEqual(1);
    // midi 62 should be entirely FN
    expect(fnSegments.some(n => n.note.midi === 62)).toBe(true);
  });

  it('eval-fp-only-own: highlights EST exclusive (FP) segments', () => {
    const sm = setupSM();
    const eh = new EvaluationHandler(sm as any);
    const out = eh.getEvaluationColoredNotes(baseState, baseNotes, 'eval-fp-only-own');
    // FP-only mode: EST exclusive segments should be highlighted
    // EST note midi 64 [3.0..3.5] is entirely unmatched (FP)
    expect(out.length).toBeGreaterThanOrEqual(1);
    const estNotes = out.filter(n => n.fileId === estId);
    expect(estNotes.length).toBeGreaterThanOrEqual(1);
    // Check that FP (exclusive) segments exist for EST
    const fpSegments = estNotes.filter(n => n.note.isEvalHighlightSegment && n.note.evalSegmentKind === 'exclusive');
    expect(fpSegments.length).toBeGreaterThanOrEqual(1);
    // midi 64 should be entirely FP
    expect(fpSegments.some(n => n.note.midi === 64)).toBe(true);
  });
});


