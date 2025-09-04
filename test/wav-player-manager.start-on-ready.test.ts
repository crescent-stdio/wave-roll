/**
 * WavPlayerManager should start WAV playback when buffers become ready,
 * even if players are created lazily and buffer loading completes later.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ensure a window shim exists for window.setTimeout used by the manager
// Vitest fake timers patch global setTimeout; mirror onto window.
// @ts-ignore
globalThis.window = globalThis as any;

// Minimal Tone mock to drive WavPlayerManager logic without a real AudioContext
vi.mock('tone', () => {
  class GrainPlayer {
    public buffer?: { loaded?: boolean };
    public playbackRate = 1;
    public volume = { value: 0 };
    constructor(_optsOrUrl: any) {
      this.buffer = { loaded: false };
    }
    connect(_node: any) { return this; }
    start = vi.fn((_when: string, _offset: number) => {});
    stop = vi.fn((_when?: string) => {});
    dispose = vi.fn(() => {});
  }
  class Panner {
    public pan = { value: 0 };
    toDestination() { return this; }
    connect(_node: any) { return this; }
    dispose = vi.fn(() => {});
  }
  const gainToDb = (g: number) => (g <= 0 ? -Infinity : 20 * Math.log10(g));
  const dbToGain = (db: number) => (db === -Infinity ? 0 : Math.pow(10, db / 20));
  const now = () => 0; // fixed for deterministic timers
  const getTransport = () => ({ bpm: { value: 120 } });
  return { GrainPlayer, Panner, gainToDb, dbToGain, now, getTransport, context: { state: 'running' }, start: vi.fn() };
});

import { WavPlayerManager } from '@/lib/core/audio/managers/wav-player-manager';

describe('WavPlayerManager WAV start-on-ready', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Provide a minimal audio registry with one visible/unmuted file
    (globalThis as any)._waveRollAudio = {
      getFiles: () => [
        { id: 'aud1', url: 'test.mp3', isVisible: true, isMuted: false, pan: 0 },
      ],
    };
  });

  it('schedules start and plays when buffer becomes ready', () => {
    const mgr = new WavPlayerManager();

    // Act: request start at current time with offset 2.5s
    mgr.startActiveAudioAt(2.5, '+0');

    // Grab internal entry created from registry and mark buffer as loaded
    const anyMgr = mgr as unknown as { audioPlayers: Map<string, any> };
    const entry = anyMgr.audioPlayers.get('aud1');
    expect(entry).toBeTruthy();
    expect(entry.player.start).not.toHaveBeenCalled();

    // When buffer becomes ready, a subsequent poll should start playback
    entry.player.buffer.loaded = true;

    // Advance timers to trigger the polling loop
    vi.advanceTimersByTime(20);

    expect(entry.player.start).toHaveBeenCalled();
    // Called with offsetSeconds (second arg)
    const args = entry.player.start.mock.calls[0];
    expect(args[1]).toBeCloseTo(2.5, 5);
  });

  it('isAudioActive returns true when registry has visible & unmuted items', () => {
    const mgr = new WavPlayerManager();
    // audioPlayers may still be empty at this point
    expect(mgr.isAudioActive()).toBe(true);
  });
});

