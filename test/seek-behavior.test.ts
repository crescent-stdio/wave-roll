import { describe, it, expect, vi } from 'vitest';

// Shim window timers for managers expecting window
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
globalThis.window = globalThis as any;

vi.mock('tone', () => ({
  getTransport: () => ({ state: 'stopped', seconds: 0, bpm: { value: 120 }, start: vi.fn(), stop: vi.fn(), pause: vi.fn(), cancel: vi.fn(), on: vi.fn(), off: vi.fn() }),
  context: { state: 'running' },
  getContext: () => ({ state: 'running', resume: vi.fn(), lookAhead: 0.1, updateInterval: 0.02, rawContext: { sampleRate: 44100, baseLatency: 0 } }),
  start: vi.fn(async () => {}),
  now: () => 0,
}));

import { AudioPlayer } from '@/lib/core/audio/audio-player';

describe('Seek behavior (unit)', () => {
  it('seek updates nowTime and getState().currentTime', async () => {
    const player = new AudioPlayer([], {}, {} as any);

    // initial seek while stopped
    player.seek(3.2);
    const st1 = player.getState();
    expect(Math.abs(st1.nowTime - 3.2)).toBeLessThan(1e-6);
    expect(Math.abs(st1.currentTime - 3.2)).toBeLessThan(1e-6);

    // play then seek
    await player.play();
    player.seek(5.0);
    const st2 = player.getState();
    expect(typeof st2.currentTime).toBe('number');
  });
});


