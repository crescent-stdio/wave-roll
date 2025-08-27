/**
 * Ensure WAV 음소거 해제 시(특히 속도 변경 이후에도) 재생 중이면 현재 위치에서 즉시 시작한다.
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
    // 가짜 피아노롤 동기 객체
    const pianoRoll = { setTime: vi.fn() } as any;
    player = new AudioPlayer(notes, pianoRoll, { tempo: 120, volume: 0.7 });
  });

  afterEach(() => {
    player?.destroy();
  });

  test('음소거 해제 시 현재 위치에서 즉시 시작', () => {
    // 내부 상태: 재생 중이며 현재 위치가 존재한다고 가정
    const anyPlayer = player as any;
    anyPlayer.state.isPlaying = true;
    anyPlayer.state.currentTime = 3.21;

    // audioPlayers 맵에 가짜 WAV 엔트리 주입
    const start = vi.fn();
    const stop = vi.fn();
    const fakeEntry = {
      player: {
        volume: { value: -120 }, // 이전에 실질적으로 음소거 상태였음
        start,
        stop,
        // buffer.loaded 플래그가 true인 것처럼 동작시키기 위해 buffer만 제공
        buffer: { loaded: true },
      },
      panner: { dispose: vi.fn(), pan: { value: 0 } },
      url: 'fake-url.wav',
    };

    anyPlayer.audioPlayers.set('wav1', fakeEntry);

    // 볼륨을 1.0으로 설정(음소거 해제)
    player.setWavVolume('wav1', 1.0);

    expect(stop).toHaveBeenCalled();
    expect(start).toHaveBeenCalled();
    // 두 번째 인자가 offsetSeconds
    const args = start.mock.calls[0];
    expect(args[1]).toBeCloseTo(3.21, 2);
  });
});

