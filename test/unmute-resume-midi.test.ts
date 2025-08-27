/**
 * 시나리오: 새로고침 후 재생 → 모든 파일 음소거 → MIDI 하나 음소거 해제 시 소리가 안 나는 문제
 * 수정: 모든 소스 음소거로 인한 자동 일시정지 후, 첫 음소거 해제 시 자동 재생 + 헬드 노트 재트리거
 */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Tone from 'tone';
import { AudioPlayer } from '@/lib/core/audio/audio-player';
import type { NoteData } from '@/lib/midi/types';

describe('Auto-resume on unmute after all-silent pause (MIDI)', () => {
  let player: AudioPlayer;
  const notes: NoteData[] = [
    // 하나의 트랙(track1)에 길게 지속되는 노트 5초
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

  test('모든 음소거 후 첫 음소거 해제 시 자동 재생', async () => {
    // 1) 재생 시작
    await player.play();
    expect(player.getState().isPlaying).toBe(true);

    // 2) 잠시 경과
    await new Promise(r => setTimeout(r, 150));

    // 3) 모든 파일 음소거(단일 트랙)
    player.setFileMute('track1', true);

    // 자동 일시정지되었는지 확인
    await new Promise(r => setTimeout(r, 50));
    expect(player.getState().isPlaying).toBe(false);

    // 4) 하나 음소거 해제 → 자동 재생되어야 함
    player.setFileMute('track1', false);
    await new Promise(r => setTimeout(r, 120));

    expect(player.getState().isPlaying).toBe(true);
  });
});

