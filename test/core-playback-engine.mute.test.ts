/**
 * CorePlaybackEngine mute behavior (unit-level, with mocks).
 *
 * This suite validates that mute operations do not force audio player
 * recreation and that mute states are forwarded/persisted properly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCorePlaybackEngine } from '@/lib/core/playback/core-playback-engine';
import { StateManager } from '@/lib/core/state';
import type { NoteData } from '@/lib/midi/types';

// Mock the audio factory to avoid Tone.js side effects
vi.mock('@/core/audio', async () => {
  return {
    createAudioPlayer: vi.fn((notes: NoteData[]) => {
      const state = {
        isPlaying: false,
        isRepeating: false,
        currentTime: 0,
        duration: Math.max(0, ...notes.map(n => n.time + n.duration)),
        volume: 0.7,
        tempo: 120,
        originalTempo: 120,
        pan: 0,
      };
      const api = {
        play: vi.fn(async () => { state.isPlaying = true; }),
        pause: vi.fn(() => { state.isPlaying = false; }),
        restart: vi.fn(),
        toggleRepeat: vi.fn(),
        seek: vi.fn((sec: number) => { state.currentTime = sec; }),
        setVolume: vi.fn((v: number) => { state.volume = v; }),
        setTempo: vi.fn((bpm: number) => { state.tempo = bpm; }),
        setPlaybackRate: vi.fn(),
        setLoopPoints: vi.fn(),
        getState: vi.fn(() => ({ ...state })),
        destroy: vi.fn(),
        setPan: vi.fn((p: number) => { state.pan = p; }),
        setFilePan: vi.fn(),
        setFileMute: vi.fn(),
        setFileVolume: vi.fn(),
        setWavVolume: vi.fn(),
      };
      return api;
    }),
  } as any;
});

const makeNotes = (fileId: string, count = 2): NoteData[] =>
  Array.from({ length: count }).map((_, i) => ({
    midi: 60 + i,
    name: 'N',
    time: i * 0.5,
    duration: 0.5,
    velocity: 0.8,
    fileId,
    ticks: 0,
    pitch: 'C',
    octave: 4,
  } as any));

describe('CorePlaybackEngine mute behavior', () => {
  let engine: ReturnType<typeof createCorePlaybackEngine>;
  let state: StateManager;

  beforeEach(async () => {
    state = new StateManager();
    engine = createCorePlaybackEngine(state, { enableStateSync: true, updateInterval: 1000 });
    const pr = {
      getPianoRollInstance: () => ({ setTime: vi.fn(), onTimeChange: vi.fn() }),
      setTime: vi.fn(),
    } as any;
    await engine.initialize(pr);
  });

  it('does not recreate audio when only mute flags change', async () => {
    const { createAudioPlayer } = await import('@/core/audio');
    await engine.updateAudio([...makeNotes('A'), ...makeNotes('B')]);
    expect((createAudioPlayer as any).mock.calls.length).toBe(1);

    // Same file set, but with arbitrary "muted" flags on NoteData (ignored by signature)
    const withMuteFlag = [...makeNotes('A'), ...makeNotes('B')].map((n, i) => ({ ...n, muted: i % 2 === 0 } as any));
    await engine.updateAudio(withMuteFlag);
    expect((createAudioPlayer as any).mock.calls.length).toBe(1);
  });

  it('recreates audio when fileIds set changes', async () => {
    const { createAudioPlayer } = await import('@/core/audio');
    const initial = (createAudioPlayer as any).mock.calls.length;
    await engine.updateAudio(makeNotes('A'));
    expect((createAudioPlayer as any).mock.calls.length).toBe(initial + 1);
    await engine.updateAudio([...makeNotes('A'), ...makeNotes('B')]);
    expect((createAudioPlayer as any).mock.calls.length).toBe(initial + 2);
  });

  it('forwards mute to audio player and persists via StateManager', async () => {
    const { createAudioPlayer } = await import('@/core/audio');
    await engine.updateAudio([...makeNotes('A'), ...makeNotes('B')]);
    const results = (createAudioPlayer as any).mock.results;
    const player = results[results.length - 1].value;
    engine.setFileMute('A', true);
    expect(player.setFileMute).toHaveBeenCalledWith('A', true);
    expect(state.getFileMuteState('A')).toBe(true);
  });
});
