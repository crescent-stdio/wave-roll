/**
 * SilenceDetector unit tests (no audio context required).
 */
import { describe, it, expect, vi } from 'vitest';
import { SilenceDetector } from '@/lib/core/playback/silence-detector';

describe('SilenceDetector', () => {
  it('triggers onSilenceDetected when all sources become silent', () => {
    const onSilenceDetected = vi.fn();
    const onSoundDetected = vi.fn();
    const sd = new SilenceDetector({ onSilenceDetected, onSoundDetected });

    sd.setFileVolume('A', 1);
    sd.setWavVolume('W1', 1);
    expect(onSilenceDetected).not.toHaveBeenCalled();

    // Mute MIDI
    sd.setFileVolume('A', 0);
    expect(onSilenceDetected).not.toHaveBeenCalled();

    // Mute WAV -> now truly silent
    sd.setWavVolume('W1', 0);
    expect(onSilenceDetected).toHaveBeenCalledTimes(1);
  });

  it('triggers onSoundDetected when sound returns from silent state', () => {
    const onSilenceDetected = vi.fn();
    const onSoundDetected = vi.fn();
    const sd = new SilenceDetector({ onSilenceDetected, onSoundDetected });

    sd.setFileVolume('A', 0);
    sd.setWavVolume('W1', 0);
    expect(onSilenceDetected).toHaveBeenCalledTimes(1);

    sd.setFileVolume('A', 0.5);
    expect(onSoundDetected).toHaveBeenCalledTimes(1);
  });

  it('master volume at 0 forces silent state', () => {
    const onSilenceDetected = vi.fn();
    const sd = new SilenceDetector({ onSilenceDetected });
    sd.setFileVolume('A', 1);
    sd.setMasterVolume(0);
    expect(onSilenceDetected).toHaveBeenCalledTimes(1);
  });
});

