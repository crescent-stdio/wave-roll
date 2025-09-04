/**
 * Ensure AudioPlayer forwards current visual time to WavPlayerManager when
 * unmuting a WAV during playback, so WAV and MIDI remain aligned.
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
    getFileMuteStates() { return new Map(); }
    getFileVolumeStates() { return new Map(); }
  },
}));

const wavSpies = {
  setWavVolume: vi.fn(),
};

vi.mock('@/lib/core/audio/managers/wav-player-manager', () => ({
  WavPlayerManager: class {
    setWavVolume = wavSpies.setWavVolume
    isAudioActive = () => true
    startActiveAudioAt = vi.fn()
    stopAllAudioPlayers = vi.fn()
    setVolume = vi.fn()
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

describe('AudioPlayer WAV unmute keeps sync during playback', () => {
  it('forwards currentTime to WavPlayerManager.setWavVolume()', async () => {
    const pianoRoll = { setTime: vi.fn() } as any;
    const player = new AudioPlayer([
      { midi: 60, name: 'C4', time: 0, duration: 20, velocity: 0.8, ticks: 0, pitch: 'C', octave: 4 },
    ] as any, pianoRoll, { tempo: 120, volume: 0.5, repeat: false });

    // Simulate already playing at visual 12.34
    const anyPlayer = player as any;
    anyPlayer.state.isPlaying = true;
    anyPlayer.state.currentTime = 12.34;

    // Act: increase WAV volume from 0 to >0
    player.setWavVolume('aud1', 1.0);

    expect(wavSpies.setWavVolume).toHaveBeenCalled();
    const args = wavSpies.setWavVolume.mock.calls.at(-1)!;
    // Args: (fileId, volume, masterVolume, { isPlaying, currentTime })
    expect(args[3]).toMatchObject({ isPlaying: true });
    expect(args[3].currentTime).toBeCloseTo(12.34, 6);
  });
});
