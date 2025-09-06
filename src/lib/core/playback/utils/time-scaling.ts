/**
 * Compute effective duration under playback rate (percentage).
 * Example: duration=10, rate=200 => effective=5
 */
export function computeEffectiveDuration(durationSec: number, playbackRatePercent: number): number {
  const speed = playbackRatePercent / 100;
  return speed > 0 ? durationSec / speed : durationSec;
}

/**
 * Map a percentage (0-100) to seconds using effective duration.
 */
export function percentToSeconds(percent0to100: number, durationSec: number, playbackRatePercent: number): number {
  const eff = computeEffectiveDuration(durationSec, playbackRatePercent);
  const pct01 = Math.max(0, Math.min(100, percent0to100)) / 100;
  return eff * pct01;
}

