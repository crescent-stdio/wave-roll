/**
 * Unit tests for TP/FP/FN-only highlight modes.
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

  it('eval-tp-only-own: shows only intersection segments', () => {
    const sm = setupSM();
    const eh = new EvaluationHandler(sm as any);
    const out = eh.getEvaluationColoredNotes(baseState, baseNotes, 'eval-tp-only-own');
    // Expect only intersection [0.5..1.0] from midi 60
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.every(n => n.note.time >= 0.5 && n.note.time + n.note.duration <= 1.0)).toBe(true);
  });

  it('eval-fn-only-gray: shows only REF-only segments', () => {
    const sm = setupSM();
    const eh = new EvaluationHandler(sm as any);
    const out = eh.getEvaluationColoredNotes(baseState, baseNotes, 'eval-fn-only-gray');
    // Expect only REF-only: [0.0..0.5] for midi 60 and [2.0..2.5] for midi 62
    const refNotes = out.filter(n => n.fileId === refId);
    expect(refNotes.length).toBeGreaterThanOrEqual(2);
    expect(refNotes.some(n => Math.abs(n.note.time - 0.0) < 1e-6 && Math.abs(n.note.duration - 0.5) < 1e-6)).toBe(true);
    expect(refNotes.some(n => Math.abs(n.note.time - 2.0) < 1e-6 && Math.abs(n.note.duration - 0.5) < 1e-6)).toBe(true);
    // No EST-only segments in FN-only
    expect(out.every(n => n.fileId !== estId)).toBe(true);
  });

  it('eval-fp-only-own: shows only EST-only segments', () => {
    const sm = setupSM();
    const eh = new EvaluationHandler(sm as any);
    const out = eh.getEvaluationColoredNotes(baseState, baseNotes, 'eval-fp-only-own');
    // Expect EST-only: [0.5..0.5] outside intersection (none before here) and [3.0..3.5]
    // Practically we should see only the unmatched est note [3.0..3.5]
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.every(n => n.fileId === estId)).toBe(true);
    expect(out.some(n => Math.abs(n.note.time - 3.0) < 1e-6 && Math.abs(n.note.duration - 0.5) < 1e-6)).toBe(true);
  });
});


