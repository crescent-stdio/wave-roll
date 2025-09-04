import { describe, it, expect, vi } from 'vitest';

// Shim window for timers used in TransportSyncManager
// @ts-ignore
globalThis.window = globalThis as any;

vi.mock('tone', () => ({
  getTransport: () => ({
    state: 'stopped',
    seconds: 0,
    bpm: { value: 120 },
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }),
  context: { state: 'running' },
  getContext: () => ({ state: 'running', resume: vi.fn(), lookAhead: 0.1, updateInterval: 0.02, rawContext: { sampleRate: 44100, baseLatency: 0 } }),
  start: vi.fn(async () => {}),
  now: () => 0,
}));

const samplerSpies = {
  initialize: vi.fn(() => Promise.resolve()),
  setupNotePart: vi.fn(),
  startPart: vi.fn(),
  stopPart: vi.fn(),
  setVolume: vi.fn(),
  areAllTracksMuted: vi.fn(() => false),
  areAllTracksZeroVolume: vi.fn(() => false),
};

vi.mock('@/lib/core/audio/managers/sampler-manager', () => ({
  SamplerManager: class {
    initialize = samplerSpies.initialize
    setupNotePart = samplerSpies.setupNotePart
    startPart = samplerSpies.startPart
    stopPart = samplerSpies.stopPart
    setVolume = samplerSpies.setVolume
    areAllTracksMuted = samplerSpies.areAllTracksMuted
    areAllTracksZeroVolume = samplerSpies.areAllTracksZeroVolume
  },
}));

const wavSpies = {
  isAudioActive: vi.fn(() => true),
  startActiveAudioAt: vi.fn(),
  areAllPlayersMuted: vi.fn(() => false),
};

vi.mock('@/lib/core/audio/managers/wav-player-manager', () => ({
  WavPlayerManager: class {
    isAudioActive = wavSpies.isAudioActive
    startActiveAudioAt = wavSpies.startActiveAudioAt
    areAllPlayersMuted = wavSpies.areAllPlayersMuted
  },
}));

vi.mock('@/lib/core/audio/managers/transport-sync-manager', () => ({
  TransportSyncManager: class {
    constructor(_p: any, _s: any, _o: any, _t: number) {}
    startSyncScheduler() {}
    stopSyncScheduler() {}
    transportToVisualTime(t: number) { return t; }
    visualToTransportTime(v: number) { return v; }
    updateSeekTimestamp() {}
    handleTransportStop() { return false; }
    handleTransportPause() {}
    handleTransportLoop() {}
    setEndCallback() {}
  },
}));

vi.mock('@/lib/core/audio/managers/loop-manager', async (orig) => {
  const mod = await orig();
  return mod; // use real implementation for setLoopPoints
});

import { AudioPlayer } from '@/lib/core/audio/audio-player';

describe('AudioPlayer B-only loop play alignment', () => {
  it('loops [0, B) and aligns offsets at play()', async () => {
    const pianoRoll = { setTime: vi.fn() } as any;
    const player = new AudioPlayer([
      { midi: 60, name: 'C4', time: 0, duration: 10, velocity: 0.8, ticks: 0, pitch: 'C', octave: 4 },
    ] as any, pianoRoll, { tempo: 120, volume: 0.5, repeat: true });

    // B-only loop: set B=3 (A is null)
    player.setLoopPoints(null, 3);
    // Seek to t=2
    player.seek(2);

    samplerSpies.startPart.mockClear();
    wavSpies.startActiveAudioAt.mockClear();

    await player.play();

    // WAV starts at visual 2
    expect(wavSpies.startActiveAudioAt).toHaveBeenCalled();
    const wavArgs = wavSpies.startActiveAudioAt.mock.calls[0];
    expect(wavArgs[0]).toBeCloseTo(2, 6);

    // Sampler Part offset should be (2 - 0) = 2 in transport seconds
    expect(samplerSpies.startPart).toHaveBeenCalled();
    const partArgs = samplerSpies.startPart.mock.calls[0];
    expect(partArgs[1]).toBeCloseTo(2, 6);
  });
});
