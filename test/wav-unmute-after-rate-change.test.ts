/**
 * Ensure that when unmuting a WAV (even after a playback rate change),
 * if playback is active, it restarts immediately from the current position.
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioPlayer } from '@/lib/core/audio/audio-player';
import type { NoteData } from '@/lib/midi/types';

describe('WAV unmute after rate change', () => {
  let player: AudioPlayer;
  const notes: NoteData[] = [
    { midi: 60, name: 'C4', time: 0, duration: 1, velocity: 0.8 },
  ];

  beforeEach(() => {
    // Fake piano-roll sync object
    const pianoRoll = { setTime: vi.fn() } as any;
    player = new AudioPlayer(notes, pianoRoll, { tempo: 120, volume: 0.7 });
  });

  afterEach(() => {
    player?.destroy();
  });

  test('Unmuting resumes immediately from the current position', () => {
    // Assume internal state is playing and currentTime is valid
    const anyPlayer = player as any;
    anyPlayer.state.isPlaying = true;
    anyPlayer.state.currentTime = 3.21;

    // Inject a fake WAV entry into the audioPlayers map
    const start = vi.fn();
    const stop = vi.fn();
    const fakeEntry = {
      player: {
        volume: { value: -120 }, // was effectively muted before
        start,
        stop,
        // Provide only `buffer` so it behaves as if `buffer.loaded` is true
        buffer: { loaded: true },
      },
      panner: { dispose: vi.fn(), pan: { value: 0 } },
      url: 'fake-url.wav',
    };

    anyPlayer.audioPlayers.set('wav1', fakeEntry);

    // Set volume to 1.0 (unmute)
    player.setWavVolume('wav1', 1.0);

    expect(stop).toHaveBeenCalled();
    expect(start).toHaveBeenCalled();
    // The second argument is `offsetSeconds`
    const args = start.mock.calls[0];
    expect(args[1]).toBeCloseTo(3.21, 2);
  });
});
