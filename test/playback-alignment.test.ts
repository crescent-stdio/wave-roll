/**
 * Ensure WAV and MIDI start from aligned positions for play/seek/loop.
 */
import { describe, it, expect, vi } from 'vitest';
// Shim window for TransportSyncManager timers
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-explicit-any
globalThis.window = globalThis as any;

// Tone mock
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
  start: vi.fn(async () => {}),
  now: () => 0,
}));

// SamplerManager spy
const samplerSpies = {
  initialize: vi.fn(() => Promise.resolve()),
  setupNotePart: vi.fn(),
  startPart: vi.fn(),
  stopPart: vi.fn(),
  setVolume: vi.fn(),
};

vi.mock('@/lib/core/audio/managers/sampler-manager', () => ({
  SamplerManager: class {
    initialize = samplerSpies.initialize
    setupNotePart = samplerSpies.setupNotePart
    startPart = samplerSpies.startPart
    stopPart = samplerSpies.stopPart
    setVolume = samplerSpies.setVolume
  },
}));

// WAV manager spy
const wavSpies = {
  isAudioActive: vi.fn(() => true),
  startActiveAudioAt: vi.fn(),
  stopAllAudioPlayers: vi.fn(),
  setVolume: vi.fn(),
};

vi.mock('@/lib/core/audio/managers/wav-player-manager', () => ({
  WavPlayerManager: class {
    isAudioActive = wavSpies.isAudioActive
    startActiveAudioAt = wavSpies.startActiveAudioAt
    stopAllAudioPlayers = wavSpies.stopAllAudioPlayers
    setVolume = wavSpies.setVolume
  },
}));

// Transport sync + loop manager real behavior is used for mapping/offset
vi.mock('@/lib/core/audio/managers/transport-sync-manager', async (orig) => {
  const mod = await orig();
  return mod; // use real
});
vi.mock('@/lib/core/audio/managers/loop-manager', async (orig) => {
  const mod = await orig();
  return mod; // use real
});

import { AudioPlayer } from '@/lib/core/audio/audio-player';

describe('Playback alignment: MIDI vs WAV', () => {
  it('play() aligns offsets without loop', async () => {
    const pianoRoll = { setTime: vi.fn() } as any;
    const player = new AudioPlayer([
      { midi: 60, name: 'C4', time: 0, duration: 1, velocity: 0.8, ticks: 0, pitch: 'C', octave: 4 },
      { midi: 62, name: 'D4', time: 8, duration: 1, velocity: 0.8, ticks: 0, pitch: 'D', octave: 4 },
    ] as any, pianoRoll, { tempo: 120, volume: 0.5 });

    // Seek to 5s visual
    player.seek(5);

    samplerSpies.startPart.mockClear();
    wavSpies.startActiveAudioAt.mockClear();

    await player.play();

    // WAV started at visual offset
    expect(wavSpies.startActiveAudioAt).toHaveBeenCalled();
    const wavArgs = wavSpies.startActiveAudioAt.mock.calls[0];
    expect(wavArgs[0]).toBeCloseTo(5, 6);

    // Sampler started with part offset equal to transport seconds (no loop, tempo=orig)
    expect(samplerSpies.startPart).toHaveBeenCalled();
    const partArgs = samplerSpies.startPart.mock.calls[0];
    expect(partArgs[1]).toBeCloseTo(5, 6);
  });

  it('play() aligns offsets with loop window (A=1, B=3, start at 2)', async () => {
    const pianoRoll = { setTime: vi.fn() } as any;
    const player = new AudioPlayer([
      { midi: 60, name: 'C4', time: 0, duration: 10, velocity: 0.8, ticks: 0, pitch: 'C', octave: 4 },
    ] as any, pianoRoll, { tempo: 120, volume: 0.5, repeat: true });

    // Set loop [1,3]
    player.setLoopPoints(1, 3);
    // Seek to 2 (inside loop)
    player.seek(2);

    samplerSpies.startPart.mockClear();
    wavSpies.startActiveAudioAt.mockClear();

    await player.play();

    // WAV starts at visual 2
    const wavArgs = wavSpies.startActiveAudioAt.mock.calls[0];
    expect(wavArgs[0]).toBeCloseTo(2, 6);

    // Sampler Part offset should be (2 - loopStart=1) in transport seconds => 1
    const partArgs = samplerSpies.startPart.mock.calls[0];
    expect(partArgs[1]).toBeCloseTo(1, 6);
  });
});
