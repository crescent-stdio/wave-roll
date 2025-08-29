/**
 * Scenario: After a refresh then playback → mute all files → unmuting a MIDI track results in no sound.
 * Fix: After auto-pausing due to all sources being muted, on first unmute auto-resume
 * and retrigger any held notes.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Tone from 'tone';
import { AudioPlayer } from '@/lib/core/audio/audio-player';
import type { NoteData } from '@/lib/midi/types';

describe('Auto-resume on unmute after all-silent pause (MIDI)', () => {
  let player: AudioPlayer;
  const notes: NoteData[] = [
    // A single track (track1) with a long note (5 seconds)
    { midi: 60, name: 'C4', time: 0, duration: 5, velocity: 0.8, fileId: 'track1' },
  ];

  beforeEach(async () => {
    const pianoRoll = { setTime: vi.fn() } as any;
    player = new AudioPlayer(notes, pianoRoll, { tempo: 120, volume: 0.7 });
    await Tone.start();
  });

  afterEach(() => {
    player?.destroy();
    const t = Tone.getTransport();
    try { t.stop(); } catch {}
    try { t.cancel(); } catch {}
  });

  test('Auto-resume on first unmute after muting all', async () => {
    // 1) Start playback
    await player.play();
    expect(player.getState().isPlaying).toBe(true);

    // 2) Wait briefly
    await new Promise(r => setTimeout(r, 150));

    // 3) Mute all files (single track)
    player.setFileMute('track1', true);

    // Verify it auto-paused
    await new Promise(r => setTimeout(r, 50));
    expect(player.getState().isPlaying).toBe(false);

    // 4) Unmute one → should auto-resume
    player.setFileMute('track1', false);
    await new Promise(r => setTimeout(r, 120));

    expect(player.getState().isPlaying).toBe(true);
  });
});
