export interface TranscriptionToleranceOptions {
  /** Maximum allowed onset time difference in seconds (default: 50ms) */
  onsetTolerance: number;
  /** Maximum allowed pitch difference in MIDI note numbers (default: 0.5 -> 50 cents) */
  pitchTolerance: number;
  /** Maximum allowed relative difference between reference note duration and estimated note duration. For example, 0.2 allows a 20 % deviation. */
  offsetRatioTolerance: number;
  /** Minimum allowed offset tolerance in seconds (default: 50ms) */
  offsetMinTolerance: number;
}

/**
 * Default tolerance values derived from mir_eval.transcription
 * - onset_tolerance: 0.050 s (50 ms)
 * - pitch_tolerance: 50 cents -> 0.5 MIDI
 * - offset_ratio_tolerance: 0.2 (20 %)
 */
export const DEFAULT_TOLERANCES: TranscriptionToleranceOptions = {
  onsetTolerance: 0.05, // 50 ms
  pitchTolerance: 0.5, // 50 cents -> 0.5 semitone
  offsetRatioTolerance: 0.2,
  offsetMinTolerance: 0.05, // 50 ms
};

/**
 * Velocity options used for velocity-aware evaluation.
 *
 * Note: This project represents velocity in normalized [0, 1] range (Tone.js).
 * If `unit` is set to 'midi', values will be converted via v/127 to normalized space.
 */
export interface VelocityToleranceOptions {
  /** Absolute velocity difference tolerance (normalized or MIDI units). */
  velocityTolerance: number;
  /** Select unit for the tolerance value. */
  unit: 'normalized' | 'midi';
  /**
   * Matching mode for velocity:
   * - 'threshold': a pair is velocity-correct when |dv| <= tol
   * - 'weighted': compute a per-pair score = max(0, 1 - |dv|/tol), aggregated as average
   */
  mode: 'threshold' | 'weighted';
  /** Whether to include velocity gating when building the matching graph. */
  includeInMatching: boolean;
  /** Strategy when a note has missing velocity (should not happen with Tone.js). */
  missingVelocity: 'ignore' | 'zero';
}

/**
 * Default velocity options. These are chosen conservatively to match typical
 * perceptual tolerances and can be overridden by callers.
 *
 * Assumption: mir_eval velocity module compares raw MIDI velocities (0-127) with
 * an absolute tolerance. Since this project stores normalized velocities [0,1],
 * we set a default normalized tolerance of 0.1 (~13 MIDI levels) which tends to
 * align with practical usage. If you prefer MIDI units, set `unit: 'midi'` and
 * pass a corresponding `velocityTolerance`.
 */
export const DEFAULT_VELOCITY_OPTIONS: VelocityToleranceOptions = {
  velocityTolerance: 0.1, // normalized units (≈ 13/127)
  unit: 'normalized',
  mode: 'threshold',
  includeInMatching: false,
  missingVelocity: 'ignore',
};
