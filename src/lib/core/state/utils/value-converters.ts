/**
 * Value conversion utilities for state management
 */

/**
 * Convert percentage to absolute value based on duration
 */
export function percentageToAbsolute(
  percentage: number | null,
  duration: number
): number | null {
  if (percentage === null || duration === 0) return null;
  return (percentage / 100) * duration;
}

/**
 * Convert absolute value to percentage based on duration
 */
export function absoluteToPercentage(
  value: number | null,
  duration: number
): number | null {
  if (value === null || duration === 0) return null;
  return (value / duration) * 100;
}

/**
 * Convert loop points between percentage and absolute values
 */
export interface LoopPoints {
  a: number | null;
  b: number | null;
}

export function loopPointsToPercentages(
  points: LoopPoints,
  duration: number
): LoopPoints {
  return {
    a: absoluteToPercentage(points.a, duration),
    b: absoluteToPercentage(points.b, duration),
  };
}

export function percentagesToLoopPoints(
  percentages: LoopPoints,
  duration: number
): LoopPoints {
  return {
    a: percentageToAbsolute(percentages.a, duration),
    b: percentageToAbsolute(percentages.b, duration),
  };
}

/**
 * Validate and normalize loop points (ensure a <= b)
 */
export function normalizeLoopPoints(
  a: number | null,
  b: number | null
): [number | null, number | null] {
  if (a !== null && b !== null && a > b) {
    return [b, a];
  }
  return [a, b];
}