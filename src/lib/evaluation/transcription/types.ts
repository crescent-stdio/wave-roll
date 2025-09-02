// Common types for transcription matching utilities

export interface MatchEntry {
  ref: number;
  est: number;
  refPitch: number;
  estPitch: number;
  refTime: number;
  estTime: number;
  onsetDiff?: number;
  offsetDiff?: number;
  pitchDiff?: number;
  overlapRatio?: number;
  refVelocity?: number;
  estVelocity?: number;
  velocityDiff?: number;
}

export interface EnhancedMatchEntry {
  ref: number;
  est: number | number[];
  refPitch: number;
  estPitch: number | number[];
  refTime: number;
  estTime: number | number[];
  onsetDiff?: number | number[];
  offsetDiff?: number | number[];
  pitchDiff?: number | number[];
  overlapRatio?: number | number[];
  refVelocity?: number;
  estVelocity?: number | number[];
  velocityDiff?: number | number[];
  estVelocityScaled?: number | number[];
  confidence?: number;
}

export interface SecondaryMatch {
  ref: number;
  est: number;
  score: number;
}
