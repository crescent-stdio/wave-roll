export interface TranscriptionToleranceOptions {
  /** Maximum allowed onset time difference in seconds (default: 50ms) */
  onsetTolerance: number;
  /** Maximum allowed pitch difference in MIDI note numbers (default: 0.5 ~= 50 cents) */
  pitchTolerance: number;
  /** Maximum allowed relative difference between reference note duration and estimated note duration. For example, 0.2 allows a 20 % deviation. */
  offsetRatioTolerance: number;
}

/**
 * Default tolerance values derived from mir_eval.transcription
 * – onset_tolerance: 0.050 s (50 ms)
 * – pitch_tolerance: 50 cents → 0.5 MIDI
 * – offset_ratio_tolerance: 0.2 (20 %)
 */
export const DEFAULT_TOLERANCES: TranscriptionToleranceOptions = {
  onsetTolerance: 0.05, // 50 ms
  pitchTolerance: 0.5, // 50 cents ≈ 0.5 semitone
  offsetRatioTolerance: 0.2,
};
