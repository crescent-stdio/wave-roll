/**
 * CorePlaybackEngine timing/callback behavior (fake timers).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCorePlaybackEngine } from '@/lib/core/playback/core-playback-engine';
import type { NoteData } from '@/lib/midi/types';

// Mock audio factory to avoid Tone.js and schedule-heavy behavior
vi.mock('@/core/audio', async () => {
  return {
    createAudioPlayer: vi.fn((notes: NoteData[]) => {
      const state = {
        isPlaying: false,
        currentTime: 0,
        duration: Math.max(0, ...notes.map(n => n.time + n.duration)),
        volume: 0.7,
        tempo: 120,
        originalTempo: 120,
        pan: 0,
      };
      return {
        play: vi.fn(async () => { state.isPlaying = true; }),
        pause: vi.fn(() => { state.isPlaying = false; }),
        restart: vi.fn(),
        toggleRepeat: vi.fn(),
        seek: vi.fn((sec: number) => { state.currentTime = sec; }),
        setVolume: vi.fn((v: number) => { state.volume = v; }),
        setTempo: vi.fn(),
        setPlaybackRate: vi.fn(),
        setLoopPoints: vi.fn(),
        setPan: vi.fn(),
        getState: vi.fn(() => ({ ...state })),
        destroy: vi.fn(),
      } as any;
    }),
  } as any;
});

describe('CorePlaybackEngine callbacks and seek', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires immediate visual update at t=0 and again after 50ms', async () => {
    // Provide minimal window shim for setInterval/clearInterval
    (globalThis as any).window = (globalThis as any).window ?? {
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
    };
    const engine = createCorePlaybackEngine(undefined, { updateInterval: 1000 });
    const pr = { getPianoRollInstance: () => ({ onTimeChange: vi.fn() }), setTime: vi.fn() } as any;
    await engine.initialize(pr);

    // Provide minimal notes to create audio player
    const notes: NoteData[] = [{ midi: 60, time: 0, duration: 1, velocity: 0.8, ticks: 0, name: 'C4', pitch: 'C', octave: 4 } as any];
    await engine.updateAudio(notes);

    const cb = vi.fn();
    engine.onVisualUpdate(cb);

    await engine.play();
    // At least one immediate callback for start-from-zero (play + initial update loop)
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(1);

    // after setTimeout(50)
    vi.advanceTimersByTime(60);
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(2);

    engine.destroy();
  });

  it('seek sets seeking flag briefly and updates piano roll time', async () => {
    (globalThis as any).window = (globalThis as any).window ?? {
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
    };
    const engine = createCorePlaybackEngine(undefined, { updateInterval: 1000 });
    const setTime = vi.fn();
    const pr = { getPianoRollInstance: () => ({ onTimeChange: vi.fn() }), setTime } as any;
    await engine.initialize(pr);
    await engine.updateAudio([{ midi: 60, time: 0, duration: 2, velocity: 0.8, ticks: 0, name: 'C4', pitch: 'C', octave: 4 } as any]);

    // Act
    engine.seek(1.23);
    expect(setTime).toHaveBeenCalledWith(1.23);

    // After 50ms seeking flag should be cleared (internal behavior)
    vi.advanceTimersByTime(60);
    // No assertion on private flag; ensure no exception and can be called again
    engine.seek(0.5);
    expect(setTime).toHaveBeenCalledWith(0.5);

    engine.destroy();
  });
});
