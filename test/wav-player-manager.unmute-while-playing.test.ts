/**
 * When unmuting a WAV file while transport is playing, the WAV should start
 * at the current visual offset to stay aligned with MIDI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shim window for timers
// @ts-ignore
globalThis.window = globalThis as any;

// Mock Tone for WavPlayerManager
vi.mock('tone', () => {
  class GrainPlayer {
    public buffer?: { loaded?: boolean };
    public volume = { value: -100 };
    public playbackRate = 1;
    constructor(_opts: any) { this.buffer = { loaded: true }; }
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
  const now = () => 0;
  const getTransport = () => ({ bpm: { value: 120 } });
  return { GrainPlayer, Panner, gainToDb, dbToGain, now, getTransport, context: { state: 'running' }, start: vi.fn() };
});

import { WavPlayerManager } from '@/lib/core/audio/managers/wav-player-manager';

describe('WavPlayerManager unmute while playing sync', () => {
  beforeEach(() => {
    // Registry with one visible, unmuted audio file
    (globalThis as any)._waveRollAudio = {
      getFiles: () => [ { id: 'aud1', url: 'a.mp3', isVisible: true, isMuted: false, pan: 0 } ],
    };
  });

  it('starts WAV at the current visual offset on unmute', () => {
    const mgr = new WavPlayerManager();
    // Build players from registry
    mgr['setupAudioPlayersFromRegistry']({ volume: 0.7, playbackRate: 100 });
    const entry = mgr['audioPlayers'].get('aud1');
    expect(entry).toBeTruthy();

    // Simulate it was muted previously (volume very low in dB)
    entry!.player.volume.value = -100;

    // Unmute while playing at t=7.25
    mgr.setWavVolume('aud1', 1.0, 0.7, { isPlaying: true, currentTime: 7.25 });

    // Should have started at offset ~7.25s
    expect(entry!.player.start).toHaveBeenCalled();
    const args = entry!.player.start.mock.calls[0];
    expect(args[1]).toBeCloseTo(7.25, 6);
  });
});

