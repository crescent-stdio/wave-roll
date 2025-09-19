import { describe, it, expect } from 'vitest';
import { createStateManager, StateManager } from '@/core/state';

describe('Onset marker unique assignment', () => {
  it('assigns unique shapes (filled first, then outlined) up to capacity', () => {
    const sm: StateManager = createStateManager();

    const assigned = new Map<string, { shape: string; variant: string }>();
    const SHAPES = [
      'circle','square','diamond','triangle-up','triangle-down','triangle-left','triangle-right',
      'star','cross','plus','hexagon','pentagon','chevron-up','chevron-down'
    ];
    const capacity = SHAPES.length * 2; // filled + outlined

    for (let i = 0; i < capacity; i++) {
      const id = `f${i}`;
      const style = sm.ensureOnsetMarkerForFile(id);
      const key = `${style.shape}:${style.variant}`;
      // Each key must be unique within capacity
      expect(Array.from(assigned.values()).map(v => `${v.shape}:${v.variant}`)).not.toContain(key);
      assigned.set(id, { shape: style.shape as string, variant: style.variant });
    }
    expect(assigned.size).toBe(capacity);
  });

  it('reuses outlined variants after filled are exhausted', () => {
    const sm: StateManager = createStateManager();
    const SHAPES = [
      'circle','square','diamond','triangle-up','triangle-down','triangle-left','triangle-right',
      'star','cross','plus','hexagon','pentagon','chevron-up','chevron-down'
    ];
    // Fill all filled variants
    SHAPES.forEach((_, i) => sm.ensureOnsetMarkerForFile(`a${i}`));
    // Next one should be outlined of the first shape
    const next = sm.ensureOnsetMarkerForFile('next');
    expect(next.variant).toBe('outlined');
  });
});


