/**
 * EvaluationHandler minimal case for eval-gt-missed-only.
 */
import { describe, it, expect } from 'vitest';
import { EvaluationHandler } from '@/lib/components/player/wave-roll/evaluation-handler';
import { StateManager } from '@/lib/core/state';
import type { ColoredNote } from '@/lib/core/visualization/visualization-engine';

describe('EvaluationHandler eval-gt-missed-only', () => {
  it('splits reference note into exclusive and intersection segments with expected colors', () => {
    const sm = new StateManager();
    const eh = new EvaluationHandler(sm as any);

    // Two files: REF and EST with partial overlap on same pitch
    const refId = 'ref';
    const estId = 'est';
    const refColor = 0x3366ff;
    const estColor = 0xff3366;

    const state = {
      files: [
        {
          id: refId,
          color: refColor,
          parsedData: { notes: [{ midi: 60, time: 0.0, duration: 1.0, velocity: 0.8 }] },
          isPianoRollVisible: true,
        },
        {
          id: estId,
          color: estColor,
          parsedData: { notes: [{ midi: 60, time: 0.5, duration: 0.5, velocity: 0.7 }] },
          isPianoRollVisible: true,
        },
      ],
    } as any;

    sm.updateEvaluationState({
      refId,
      estIds: [estId],
      onsetTolerance: 1.0,
      pitchTolerance: 0.5,
      offsetRatioTolerance: 0.2,
      offsetMinTolerance: 0.05,
    } as any);

    const baseNotes: ColoredNote[] = [
      { note: { midi: 60, time: 0.0, duration: 1.0, velocity: 0.8, fileId: refId } as any, color: refColor, fileId: refId, isMuted: false },
      { note: { midi: 60, time: 0.5, duration: 0.5, velocity: 0.7, fileId: estId } as any, color: estColor, fileId: estId, isMuted: false },
    ];

    const out = eh.getEvaluationColoredNotes(state, baseNotes, 'eval-gt-missed-only');

    // There should be: REF-only [0.0..0.5], intersection [0.5..1.0], and EST note unaffected
    const refSegments = out.filter(n => n.fileId === refId);
    expect(refSegments.length).toBeGreaterThanOrEqual(2);
    // Find exclusive and intersection by duration
    const segA = refSegments.find(s => s.note.time === 0.0) as any;
    const segB = refSegments.find(s => Math.abs(s.note.time - 0.5) < 1e-6) as any;
    expect(segA.note.duration).toBeCloseTo(0.5, 3);
    expect(segB.note.duration).toBeCloseTo(0.5, 3);
    // Exclusive keeps file color, intersection becomes a contrasting gray (not equal to file color)
    expect(segA.color).toBe(refColor);
    expect(segB.color).not.toBe(refColor);
  });
});
