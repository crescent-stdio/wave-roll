/**
 * Enhanced transcription evaluation metrics with mir_eval compatibility.
 * 
 * This module provides improved velocity-aware metrics that match
 * mir_eval.transcription_velocity's behavior more closely, including:
 * - Proper velocity normalization and scaling
 * - Support for 1:N matching (configurable)
 * - Better handling of missing velocities
 * - Additional diagnostic metrics
 * 
 * Reference: https://github.com/mir-evaluation/mir_eval
 */

import { ParsedMidi } from "@/lib/core/utils/midi/types";
import {
  TranscriptionToleranceOptions,
  VelocityToleranceOptions,
  DEFAULT_TOLERANCES,
  DEFAULT_VELOCITY_OPTIONS,
} from "./constants";
import {
  matchNotesEnhanced,
  EnhancedNoteMatchResult,
  EnhancedMatchingOptions,
  enhancedToStandardResult,
} from "./matchNotes-enhanced";

/**
 * Enhanced metrics with additional velocity diagnostics
 */
export interface EnhancedNoteMetrics {
  // Standard PRF metrics
  precision: number;
  recall: number;
  f1: number;
  f_measure: number;
  
  // Overlap metrics
  avgOverlapRatio: number;
  
  // Count statistics
  numCorrect: number;
  numRef: number;
  numEst: number;
  
  // Velocity metrics (if available)
  velocity?: {
    // Configuration
    mode: VelocityToleranceOptions["mode"];
    toleranceNormalized: number;
    toleranceMidi: number;
    
    // Basic metrics
    numVelocityCorrect: number;
    velocityPrecision: number; // Among estimated notes
    velocityRecall: number; // Among reference notes
    velocityF1: number;
    
    // Advanced metrics
    avgVelocityError: number; // Mean absolute error
    rmseVelocity: number; // Root mean square error
    correlationCoeff: number; // Pearson correlation
    
    // Scaled metrics (after normalization)
    avgScaledError: number;
    rmseScaled: number;
    
    // Distribution metrics
    velocityErrorPercentiles: {
      p25: number;
      p50: number; // median
      p75: number;
      p90: number;
      p95: number;
    };
  };
  
  // Detailed match information
  matches: EnhancedNoteMatchResult["matches"];
  falseNegatives: number[];
  falsePositives: number[];
  
  // 1:N matching statistics (if applicable)
  matchingStats?: {
    avgMatchesPerRef: number;
    maxMatchesPerRef: number;
    refsWithMultipleMatches: number;
    totalSecondaryMatches: number;
  };
  
  // Velocity scaling parameters (if applied)
  velocityScaling?: EnhancedNoteMatchResult["velocityScaling"];
}

/**
 * Calculate percentiles from an array of numbers
 */
function calculatePercentiles(
  values: number[],
  percentiles: number[]
): number[] {
  if (values.length === 0) return percentiles.map(() => 0);
  
  const sorted = [...values].sort((a, b) => a - b);
  return percentiles.map(p => {
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  });
}

/**
 * Calculate Pearson correlation coefficient
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return den === 0 ? 0 : num / den;
}

/**
 * Compute enhanced note-level metrics with velocity analysis
 */
export function computeEnhancedNoteMetrics(
  reference: ParsedMidi,
  estimated: ParsedMidi,
  tolerances: Partial<TranscriptionToleranceOptions> = {},
  velocityOpts: Partial<VelocityToleranceOptions> = {},
  matchingOpts: EnhancedMatchingOptions = {}
): EnhancedNoteMetrics {
  const tol = { ...DEFAULT_TOLERANCES, ...tolerances };
  const vel = { ...DEFAULT_VELOCITY_OPTIONS, ...velocityOpts };
  
  // Perform enhanced matching
  const matchResult = matchNotesEnhanced(
    reference,
    estimated,
    tol,
    vel,
    matchingOpts
  );
  
  // Convert to standard format for compatibility
  const standardResult = enhancedToStandardResult(matchResult);
  
  // Basic PRF metrics
  const numCorrect = matchResult.matches.length;
  const numRef = reference.notes.length;
  const numEst = estimated.notes.length;
  
  const precision = numEst > 0 ? numCorrect / numEst : 0;
  const recall = numRef > 0 ? numCorrect / numRef : 0;
  const f1 = precision + recall > 0
    ? (2 * precision * recall) / (precision + recall)
    : 0;
  
  // Calculate average overlap ratio
  let avgOverlapRatio = 0;
  if (standardResult.matches.length > 0) {
    const overlapRatios = standardResult.matches
      .map(m => m.overlapRatio || 0)
      .filter(r => r >= 0);
    avgOverlapRatio = overlapRatios.length > 0
      ? overlapRatios.reduce((a, b) => a + b, 0) / overlapRatios.length
      : 0;
  }
  
  // Base metrics object
  const metrics: EnhancedNoteMetrics = {
    precision,
    recall,
    f1,
    f_measure: f1,
    avgOverlapRatio,
    numCorrect,
    numRef,
    numEst,
    matches: matchResult.matches,
    falseNegatives: matchResult.falseNegatives,
    falsePositives: matchResult.falsePositives,
    velocityScaling: matchResult.velocityScaling,
  };
  
  // Calculate velocity metrics if velocities are available
  const hasVelocities = reference.notes.some(n => n.velocity !== undefined) &&
                       estimated.notes.some(n => n.velocity !== undefined);
  
  if (hasVelocities) {
    // Extract matched velocities
    const matchedRefVels: number[] = [];
    const matchedEstVels: number[] = [];
    const matchedEstVelsScaled: number[] = [];
    const velocityErrors: number[] = [];
    const scaledErrors: number[] = [];
    
    for (const match of matchResult.matches) {
      if (match.refVelocity !== undefined) {
        matchedRefVels.push(match.refVelocity);
        
        // Handle both single and multiple estimated notes
        if (Array.isArray(match.estVelocity)) {
          // For 1:N matching, take the best match (first one)
          const estVel = match.estVelocity[0];
          const estVelScaled = (Array.isArray(match.estVelocityScaled)
            ? match.estVelocityScaled[0]
            : (match.estVelocityScaled ?? estVel)) as number;
          
          matchedEstVels.push(estVel);
          matchedEstVelsScaled.push(estVelScaled);
          velocityErrors.push(Math.abs(estVel - match.refVelocity));
          scaledErrors.push(Math.abs(estVelScaled - match.refVelocity));
        } else if (match.estVelocity !== undefined) {
          const estVel = match.estVelocity;
          const estVelScaled = (match.estVelocityScaled ?? estVel) as number;
          
          matchedEstVels.push(estVel);
          matchedEstVelsScaled.push(estVelScaled);
          velocityErrors.push(Math.abs(estVel - match.refVelocity));
          scaledErrors.push(Math.abs(estVelScaled - match.refVelocity));
        }
      }
    }
    
    if (matchedRefVels.length > 0) {
      // Velocity tolerance in normalized space
      const tolNorm = vel.unit === 'midi' 
        ? vel.velocityTolerance / 127 
        : vel.velocityTolerance;
      const tolMidi = vel.unit === 'midi' 
        ? vel.velocityTolerance 
        : Math.round(vel.velocityTolerance * 127);
      
      // Count velocity-correct matches
      let numVelocityCorrect = 0;
      for (let i = 0; i < scaledErrors.length; i++) {
        if (vel.mode === 'threshold') {
          if (scaledErrors[i] <= tolNorm) {
            numVelocityCorrect++;
          }
        } else {
          // Weighted mode: count as correct if score >= 0.5
          const score = Math.max(0, 1 - scaledErrors[i] / Math.max(1e-12, tolNorm));
          if (score >= 0.5) {
            numVelocityCorrect++;
          }
        }
      }
      
      // Velocity PRF (among matched notes only)
      const velocityPrecision = matchedRefVels.length > 0 
        ? numVelocityCorrect / matchedRefVels.length 
        : 0;
      const velocityRecall = numRef > 0 
        ? numVelocityCorrect / numRef 
        : 0;
      const velocityF1 = velocityPrecision + velocityRecall > 0
        ? (2 * velocityPrecision * velocityRecall) / (velocityPrecision + velocityRecall)
        : 0;
      
      // Error statistics
      const avgVelocityError = velocityErrors.reduce((a, b) => a + b, 0) / velocityErrors.length;
      const avgScaledError = scaledErrors.reduce((a, b) => a + b, 0) / scaledErrors.length;
      
      const rmseVelocity = Math.sqrt(
        velocityErrors.reduce((sum, e) => sum + e * e, 0) / velocityErrors.length
      );
      const rmseScaled = Math.sqrt(
        scaledErrors.reduce((sum, e) => sum + e * e, 0) / scaledErrors.length
      );
      
      const correlationCoeff = pearsonCorrelation(matchedRefVels, matchedEstVelsScaled);
      
      // Error percentiles
      const percentileValues = calculatePercentiles(scaledErrors, [25, 50, 75, 90, 95]);
      
      metrics.velocity = {
        mode: vel.mode,
        toleranceNormalized: tolNorm,
        toleranceMidi: tolMidi,
        numVelocityCorrect,
        velocityPrecision,
        velocityRecall,
        velocityF1,
        avgVelocityError,
        rmseVelocity,
        correlationCoeff,
        avgScaledError,
        rmseScaled,
        velocityErrorPercentiles: {
          p25: percentileValues[0],
          p50: percentileValues[1],
          p75: percentileValues[2],
          p90: percentileValues[3],
          p95: percentileValues[4],
        },
      };
    }
  }
  
  // Calculate 1:N matching statistics if applicable
  if (matchingOpts.maxMatchesPerRef && matchingOpts.maxMatchesPerRef > 1) {
    let totalMatches = 0;
    let maxMatches = 0;
    let refsWithMultiple = 0;
    
    for (const match of matchResult.matches) {
      const numMatches = Array.isArray(match.est) ? match.est.length : 1;
      totalMatches += numMatches;
      maxMatches = Math.max(maxMatches, numMatches);
      if (numMatches > 1) refsWithMultiple++;
    }
    
    metrics.matchingStats = {
      avgMatchesPerRef: matchResult.matches.length > 0 
        ? totalMatches / matchResult.matches.length 
        : 0,
      maxMatchesPerRef: maxMatches,
      refsWithMultipleMatches: refsWithMultiple,
      totalSecondaryMatches: totalMatches - matchResult.matches.length,
    };
  }
  
  return metrics;
}

/**
 * Evaluate transcription with velocity following mir_eval's approach
 * This is the main entry point for evaluation
 */
export function evaluateTranscriptionEnhanced(
  reference: ParsedMidi,
  estimated: ParsedMidi,
  options: {
    tolerances?: Partial<TranscriptionToleranceOptions>;
    velocity?: Partial<VelocityToleranceOptions>;
    matching?: EnhancedMatchingOptions;
  } = {}
): EnhancedNoteMetrics {
  const defaultMatching: EnhancedMatchingOptions = {
    maxMatchesPerRef: 1, // Default to 1:1 matching
    maxMatchesPerEst: 1,
    useWeightedMatching: false,
    applyVelocityScaling: true, // mir_eval style scaling by default
  };
  
  return computeEnhancedNoteMetrics(
    reference,
    estimated,
    options.tolerances || {},
    options.velocity || {},
    { ...defaultMatching, ...options.matching }
  );
}

/**
 * Simple wrapper for backward compatibility
 */
export function evaluateTranscriptionSimple(
  reference: ParsedMidi,
  estimated: ParsedMidi
): {
  precision: number;
  recall: number;
  f1: number;
  avgOverlapRatio: number;
} {
  const metrics = evaluateTranscriptionEnhanced(reference, estimated);
  return {
    precision: metrics.precision,
    recall: metrics.recall,
    f1: metrics.f1,
    avgOverlapRatio: metrics.avgOverlapRatio,
  };
}
