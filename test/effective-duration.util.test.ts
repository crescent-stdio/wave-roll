import { describe, it, expect } from 'vitest';
import { computeEffectiveDuration, percentToSeconds } from '../src/lib/core/playback/utils/time-scaling';

describe('Effective duration utilities (no DOM, vitest only)', () => {
  it('computeEffectiveDuration returns half when rate=200%', () => {
    expect(computeEffectiveDuration(10, 200)).toBe(5);
  });

  it('percentToSeconds maps 50% to half of effective duration', () => {
    // 10s at 200% -> 5s effective, 50% -> 2.5
    expect(Math.abs(percentToSeconds(50, 10, 200) - 2.5)).toBeLessThan(1e-9);
  });

  it('percentToSeconds clamps out-of-range percentages', () => {
    // 10s at 100% -> 10s, 150% -> clamp to 100% so 10s
    expect(percentToSeconds(150, 10, 100)).toBe(10);
    expect(percentToSeconds(-20, 10, 100)).toBe(0);
  });
});

