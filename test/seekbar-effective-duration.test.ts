import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSeekBar } from '../src/lib/components/player/wave-roll/ui/seek-bar';

// Basic fake audioPlayer implementing only what seek-bar needs
const createFakePlayer = (duration: number, playbackRate: number) => {
  return {
    getState: () => ({
      isPlaying: false,
      isRepeating: false,
      currentTime: 0,
      duration,
      volume: 0.7,
      tempo: 120,
      originalTempo: 120,
      pan: 0,
      playbackRate,
    }),
    seek: vi.fn(),
  } as any;
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

describe('SeekBar effective duration mapping', () => {
  let root: HTMLElement;

  beforeEach(() => {
    // JSDOM body reset
    document.body.innerHTML = '';
  });

  it('maps 50% to half of effective duration at 200% rate', () => {
    const fake = createFakePlayer(10, 200); // duration=10s, rate=200% => effective=5s
    const sb = createSeekBar({ audioPlayer: fake, formatTime: fmt });
    root = sb.element;
    document.body.appendChild(root);

    const slider = root.querySelector('input.wr-slider') as HTMLInputElement;
    expect(slider).toBeTruthy();

    // Simulate drag to 50%
    slider.value = '50';
    slider.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

    // Effective duration is 5s, half is 2.5
    const calledWith = (fake.seek as any).mock.calls.at(-1)?.[0] as number;
    expect(Math.abs(calledWith - 2.5)).toBeLessThan(0.01);
  });
});
/**
 * @vitest-environment jsdom
 */
