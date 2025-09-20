import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onPointerUp } from '@/lib/core/visualization/piano-roll/interactions/pointer';

function createStubPianoRoll(initialTime = 0) {
  const callbacks: number[] = [];
  const cb = vi.fn((t: number) => callbacks.push(t));

  const pianoRoll: any = {
    app: { canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) } },
    state: {
      isPanning: false,
      currentTime: initialTime,
      lastPointerPos: { x: 0, y: 0 },
      panX: 0,
      panY: 0,
      zoomX: 1,
      zoomY: 1,
    },
    computeTimeAtPlayhead: vi.fn(() => initialTime),
    onTimeChangeCallback: cb,
    requestRender: vi.fn(),
    timeScale: (x: number) => x,
    pitchScale: (x: number) => x,
    options: { height: 400 },
  };

  return { pianoRoll, cb, callbacks } as const;
}

describe('piano-roll pointer up seek guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  it('does not commit when not panning (prevents hover/mouseleave seek)', () => {
    const { pianoRoll, cb } = createStubPianoRoll(1.0);
    pianoRoll.state.isPanning = false; // Simulate hover without drag

    onPointerUp({} as any, pianoRoll);

    expect(cb).not.toHaveBeenCalled();
    expect(pianoRoll.state.isPanning).toBe(false);
    expect(pianoRoll.state.currentTime).toBe(1.0);
  });

  it('commits once when panning=true and time changed', () => {
    const { pianoRoll, cb } = createStubPianoRoll(0.0);
    pianoRoll.state.isPanning = true;
    pianoRoll.computeTimeAtPlayhead = vi.fn(() => 2.5);

    onPointerUp({} as any, pianoRoll);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(2.5);
    expect(pianoRoll.state.currentTime).toBe(2.5);

    // Subsequent pointerUp with no panning must not commit again
    onPointerUp({} as any, pianoRoll);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('skips commit when time change is below epsilon', () => {
    const { pianoRoll, cb } = createStubPianoRoll(1.0);
    pianoRoll.state.isPanning = true;
    // Delta < 1e-3 should be ignored
    pianoRoll.computeTimeAtPlayhead = vi.fn(() => 1.0000005);

    onPointerUp({} as any, pianoRoll);

    expect(cb).not.toHaveBeenCalled();
    expect(pianoRoll.state.currentTime).toBe(1.0);
  });
});


