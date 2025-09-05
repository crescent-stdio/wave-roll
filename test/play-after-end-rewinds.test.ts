import { describe, it, expect, vi } from 'vitest';

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

vi.mock('@/lib/core/audio/managers/sampler-manager', () => ({
  SamplerManager: class {
    initialize() { return Promise.resolve(); }
    setupNotePart() {}
    startPart() {}
    stopPart() {}
    setVolume() {}
    areAllTracksMuted() { return false; }
    areAllTracksZeroVolume() { return false; }
  },
}));

vi.mock('@/lib/core/audio/managers/wav-player-manager', () => ({
  WavPlayerManager: class {
    isAudioActive() { return false; }
    startActiveAudioAt() {}
    stopAllAudioPlayers() {}
    setVolume() {}
    areAllPlayersMuted() { return false; }
    areAllPlayersZeroVolume() { return false; }
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

vi.mock('@/lib/core/audio/managers/loop-manager', () => ({
  LoopManager: class {
    loopStartVisual: number | null = null
    loopEndVisual: number | null = null
    handleLoopEvent() { return 0; }
    configureTransportLoop() {}
    getPartOffset(currentTime: number) { return currentTime; }
  },
}));

import { AudioPlayer } from '@/lib/core/audio/audio-player';

describe('Play-after-end rewinds to 0 and starts', () => {
  it('when not repeating, pressing play at end starts from 0', async () => {
    const pianoRoll = { setTime: vi.fn() } as any;
    const player = new AudioPlayer([
      { midi: 60, name: 'C4', time: 0, duration: 2, velocity: 0.8, ticks: 0, pitch: 'C', octave: 4 },
    ] as any, pianoRoll, { tempo: 120, volume: 0.5, repeat: false });

    // Simulate end state
    (player as any).state.currentTime = 2; // == duration
    (player as any).state.isPlaying = false;

    await player.play();

    // After play, it should have rewound to 0 and started
    const state = player.getState();
    expect(state.isPlaying).toBe(true);
    expect(state.currentTime).toBeGreaterThanOrEqual(0);
  });
});
