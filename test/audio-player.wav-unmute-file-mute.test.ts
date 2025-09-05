/**
 * Unmute via setFileMute() should start WAV playback at current position
 * when transport is playing.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('tone', () => ({
  getTransport: () => ({
    state: 'started',
    seconds: 10,
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
    ensureTrackAudible() {}
    areAllTracksMuted() { return false; }
    areAllTracksZeroVolume() { return false; }
    getFileMuteStates() { return new Map(); }
    getFileVolumeStates() { return new Map(); }
    retriggerHeldNotes() {}
  },
}));

const wavSpies = {
  setFileMute: vi.fn(() => true),
  startActiveAudioAt: vi.fn(),
  isAudioActive: vi.fn(() => true),
};

vi.mock('@/lib/core/audio/managers/wav-player-manager', () => ({
  WavPlayerManager: class {
    setFileMute = wavSpies.setFileMute
    startActiveAudioAt = wavSpies.startActiveAudioAt
    isAudioActive = wavSpies.isAudioActive
    stopAllAudioPlayers = vi.fn()
    setVolume = vi.fn()
    setPlaybackRate = vi.fn()
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

describe('AudioPlayer setFileMute WAV unmute should start playback', () => {
  it('calls startActiveAudioAt at current position when unmuting and playing', async () => {
    const pianoRoll = { setTime: vi.fn() } as any;
    const player = new AudioPlayer([
      { midi: 60, name: 'C4', time: 0, duration: 20, velocity: 0.8, ticks: 0, pitch: 'C', octave: 4 },
    ] as any, pianoRoll, { tempo: 120, volume: 0.5, repeat: false });

    // Simulate already playing at visual 5.67
    const anyPlayer = player as any;
    anyPlayer.state.isPlaying = true;
    anyPlayer.state.currentTime = 5.67;

    // Act: unmute via file-mute API
    player.setFileMute('aud1', false);

    expect(wavSpies.setFileMute).toHaveBeenCalledWith('aud1', false);
    expect(wavSpies.startActiveAudioAt).toHaveBeenCalled();
    const args = wavSpies.startActiveAudioAt.mock.calls.at(-1)!;
    expect(args[0]).toBeCloseTo(5.67, 6);
  });
});

