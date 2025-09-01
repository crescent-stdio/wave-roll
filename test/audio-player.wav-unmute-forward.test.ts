/**
 * AudioPlayer WAV unmute forwarding behavior with module mocks.
 *
 * Contract: Calling setWavVolume(fileId, >0) while paused should
 * - forward to WavPlayerManager.setWavVolume
 * - attempt to resume playback via play()
 */
import { describe, it, expect, vi } from 'vitest';

// Mock Tone to avoid any AudioContext/Transport side-effects
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
  loaded: vi.fn(async () => {}),
}));

// Mock heavy manager classes used by AudioPlayer constructor
vi.mock('@/lib/core/audio/managers/sampler-manager', () => ({
  SamplerManager: class {
    initialize() { return Promise.resolve(); }
    setupNotePart() {}
    startPart() {}
    stopPart() {}
    setVolume() {}
    setFileVolume() {}
    areAllTracksMuted() { return false; }
  },
}));

const wavManagerSpies = {
  setWavVolume: vi.fn(),
  setPlaybackRate: vi.fn(),
  startActiveAudioAt: vi.fn(),
  stopAllAudioPlayers: vi.fn(),
  refreshAudioPlayers: vi.fn(),
  getMaxAudioDuration: vi.fn(() => 0),
  isAudioActive: vi.fn(() => false),
  setVolume: vi.fn(),
};

vi.mock('@/lib/core/audio/managers/wav-player-manager', () => ({
  WavPlayerManager: class {
    setWavVolume = wavManagerSpies.setWavVolume
    setPlaybackRate = wavManagerSpies.setPlaybackRate
    startActiveAudioAt = wavManagerSpies.startActiveAudioAt
    stopAllAudioPlayers = wavManagerSpies.stopAllAudioPlayers
    refreshAudioPlayers = wavManagerSpies.refreshAudioPlayers
    getMaxAudioDuration = wavManagerSpies.getMaxAudioDuration
    isAudioActive = wavManagerSpies.isAudioActive
    setVolume = wavManagerSpies.setVolume
  },
}));

vi.mock('@/lib/core/audio/managers/transport-sync-manager', () => ({
  TransportSyncManager: class {
    constructor() {}
    stopSyncScheduler() {}
    startSyncScheduler() {}
    visualToTransportTime(v: number) { return v; }
    setEndCallback() {}
    handleTransportStop() { return false; }
    handleTransportPause() {}
    handleTransportLoop() {}
  },
}));

vi.mock('@/lib/core/audio/managers/loop-manager', () => ({
  LoopManager: class {
    loopStartVisual = 0
    loopEndVisual = 0
    handleLoopEvent() { return 0; }
    configureTransportLoop() {}
    rescaleLoopForTempoChange() {}
  },
}));

import { AudioPlayer } from '@/lib/core/audio/audio-player';

describe('AudioPlayer WAV unmute forwarding', () => {
  it('forwards to WavPlayerManager and calls play() when unmuting while paused', async () => {
    const pianoRoll = { setTime: vi.fn() } as any;
    const player = new AudioPlayer([
      { midi: 60, name: 'C4', time: 0, duration: 1, velocity: 0.8, ticks: 0, pitch: 'C', octave: 4 },
    ] as any, pianoRoll, { tempo: 120, volume: 0.5 });

    // Simulate paused state
    const anyPlayer = player as any;
    anyPlayer.state.isPlaying = false;
    anyPlayer.state.currentTime = 3.21;

    // Avoid running the real play() logic
    const playSpy = vi.spyOn(player, 'play').mockResolvedValue();

    // Act: unmute a WAV logical id
    player.setWavVolume('wav1', 1.0);

    expect(wavManagerSpies.setWavVolume).toHaveBeenCalledWith('wav1', 1.0, 0.5, {
      isPlaying: false,
      currentTime: 3.21,
    });
    expect(playSpy).toHaveBeenCalled();
  });
});

