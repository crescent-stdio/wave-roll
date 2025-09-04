import { describe, it, expect } from 'vitest';
import { LoopManager } from '@/lib/core/audio/managers/loop-manager';

describe('LoopManager B-only loop', () => {
  it('sets loop to [0, B) when start is null and end provided', () => {
    const lm = new LoopManager(120); // original tempo
    const state: any = { tempo: 120, currentTime: 1.5 };
    const duration = 10;

    const res = lm.setLoopPoints(null, 3, duration, state);

    expect(res.changed).toBe(true);
    expect(res.transportStart).toBe(0);
    expect(res.transportEnd).toBeCloseTo(3, 6); // same tempo

    // Internal state
    expect(lm['loopStartVisual']).toBeDefined();
    // Using accessor methods
    expect(lm['loopStartVisual']).toBe(0);
    expect(lm['loopEndVisual']).toBe(3);
    expect(res.shouldPreservePosition).toBe(true);
  });

  it('clamps B to duration and preservePosition respects [0, B)', () => {
    const lm = new LoopManager(120);
    const state: any = { tempo: 120, currentTime: 9 };
    const duration = 8;

    const res = lm.setLoopPoints(null, 12, duration, state);
    expect(lm['loopStartVisual']).toBe(0);
    expect(lm['loopEndVisual']).toBe(8);
    expect(res.transportEnd).toBeCloseTo(8, 6);
    // currentTime=9 outside [0,8) -> false
    expect(res.shouldPreservePosition).toBe(false);
  });
});

