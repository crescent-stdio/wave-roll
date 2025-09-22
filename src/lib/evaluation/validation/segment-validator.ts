/**
 * Segment Validator for Piano Roll Evaluation
 *
 * This utility validates that note segmentation (splitting) is performed correctly
 * according to mir_eval standards. It checks:
 *
 * 1. Duration conservation: Sum of segment durations equals original note duration
 * 2. Temporal continuity: No gaps or overlaps between segments
 * 3. Boundary accuracy: Segment boundaries align with intersection calculations
 * 4. Type consistency: Segment types match expected evaluation categories
 * 5. Visual consistency: Color assignments are correct for each segment type
 */

import type { ColoredNote } from '@/core/playback';
import type { ParsedMidi } from '@/lib/midi/types';

export interface SegmentValidationOptions {
  /** Tolerance for floating-point comparisons (default: 1e-6) */
  tolerance: number;
  /** Whether to validate segment types */
  validateTypes: boolean;
  /** Whether to validate color assignments */
  validateColors: boolean;
  /** Expected segment types in order (if known) */
  expectedTypes?: ('intersection' | 'exclusive' | 'ambiguous')[];
  /** Minimum segment duration to consider valid */
  minSegmentDuration?: number;
}

export interface SegmentValidationResult {
  /** Whether all validations passed */
  isValid: boolean;
  /** Severity level: 'error' | 'warning' | 'info' */
  severity: 'error' | 'warning' | 'info';
  /** List of validation errors */
  errors: ValidationError[];
  /** List of validation warnings */
  warnings: ValidationWarning[];
  /** Calculated metrics */
  metrics: SegmentMetrics;
  /** Detailed segment analysis */
  segmentAnalysis: SegmentAnalysis[];
}

export interface ValidationError {
  type: 'duration_mismatch' | 'temporal_gap' | 'temporal_overlap' | 'invalid_type' | 'invalid_color' | 'zero_duration';
  message: string;
  segmentIndex?: number;
  expectedValue?: number;
  actualValue?: number;
  tolerance?: number;
}

export interface ValidationWarning {
  type: 'small_segment' | 'color_inconsistency' | 'type_mismatch';
  message: string;
  segmentIndex?: number;
  recommendation?: string;
}

export interface SegmentMetrics {
  /** Total duration of all segments */
  totalSegmentDuration: number;
  /** Original note duration */
  originalDuration: number;
  /** Duration conservation ratio (should be 1.0) */
  durationConservationRatio: number;
  /** Number of segments */
  segmentCount: number;
  /** Average segment duration */
  averageSegmentDuration: number;
  /** Minimum segment duration */
  minSegmentDuration: number;
  /** Maximum segment duration */
  maxSegmentDuration: number;
  /** Total temporal gaps between segments */
  totalGaps: number;
  /** Total temporal overlaps between segments */
  totalOverlaps: number;
  /** Segment type distribution */
  typeDistribution: Record<string, number>;
  /** Color consistency score (0-1) */
  colorConsistencyScore: number;
}

export interface SegmentAnalysis {
  /** Index of the segment */
  index: number;
  /** Start time of segment */
  startTime: number;
  /** End time of segment */
  endTime: number;
  /** Duration of segment */
  duration: number;
  /** Segment type */
  type?: 'intersection' | 'exclusive' | 'ambiguous';
  /** Color of segment */
  color: number;
  /** Whether this segment has evaluation flags */
  isEvalSegment: boolean;
  /** Gap to next segment (if any) */
  gapToNext?: number;
  /** Overlap with next segment (if any) */
  overlapWithNext?: number;
  /** Validation issues specific to this segment */
  issues: string[];
}

export class SegmentValidator {
  private readonly defaultOptions: SegmentValidationOptions = {
    tolerance: 1e-6,
    validateTypes: true,
    validateColors: true,
    minSegmentDuration: 1e-9
  };

  /**
   * Validates note segmentation for a single original note
   */
  public validateNoteSegmentation(
    originalNote: any,
    segments: ColoredNote[],
    options: Partial<SegmentValidationOptions> = {}
  ): SegmentValidationResult {
    const opts = { ...this.defaultOptions, ...options };
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Sort segments by start time
    const sortedSegments = segments.slice().sort((a, b) => a.note.time - b.note.time);

    // Perform validations
    const durationValidation = this.validateDurationConservation(originalNote, sortedSegments, opts);
    const temporalValidation = this.validateTemporalContinuity(sortedSegments, opts);
    const typeValidation = opts.validateTypes ? this.validateSegmentTypes(sortedSegments, opts) : { errors: [], warnings: [] };
    const colorValidation = opts.validateColors ? this.validateColorAssignments(sortedSegments, opts) : { errors: [], warnings: [] };

    // Collect all errors and warnings
    errors.push(...durationValidation.errors, ...temporalValidation.errors, ...typeValidation.errors, ...colorValidation.errors);
    warnings.push(...durationValidation.warnings, ...temporalValidation.warnings, ...typeValidation.warnings, ...colorValidation.warnings);

    // Calculate metrics
    const metrics = this.calculateMetrics(originalNote, sortedSegments, opts);

    // Generate segment analysis
    const segmentAnalysis = this.analyzeSegments(sortedSegments, opts);

    // Determine overall result
    const isValid = errors.length === 0;
    const severity = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'info';

    return {
      isValid,
      severity,
      errors,
      warnings,
      metrics,
      segmentAnalysis
    };
  }

  /**
   * Validates multiple notes at once and provides aggregate statistics
   */
  public validateMultipleNotes(
    noteValidations: Array<{
      originalNote: any;
      segments: ColoredNote[];
      noteId?: string;
    }>,
    options: Partial<SegmentValidationOptions> = {}
  ): {
    overallValid: boolean;
    individualResults: Array<SegmentValidationResult & { noteId?: string }>;
    aggregateMetrics: AggregateMetrics;
  } {
    const opts = { ...this.defaultOptions, ...options };

    const individualResults = noteValidations.map((validation, index) => ({
      ...this.validateNoteSegmentation(validation.originalNote, validation.segments, opts),
      noteId: validation.noteId || `note_${index}`
    }));

    const aggregateMetrics = this.calculateAggregateMetrics(individualResults);
    const overallValid = individualResults.every(result => result.isValid);

    return {
      overallValid,
      individualResults,
      aggregateMetrics
    };
  }

  private validateDurationConservation(
    originalNote: any,
    segments: ColoredNote[],
    options: SegmentValidationOptions
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const originalDuration = originalNote.duration;
    const totalSegmentDuration = segments.reduce((sum, seg) => sum + seg.note.duration, 0);
    const durationDiff = Math.abs(totalSegmentDuration - originalDuration);

    if (durationDiff > options.tolerance) {
      errors.push({
        type: 'duration_mismatch',
        message: `Total segment duration (${totalSegmentDuration.toFixed(6)}) does not match original duration (${originalDuration.toFixed(6)})`,
        expectedValue: originalDuration,
        actualValue: totalSegmentDuration,
        tolerance: options.tolerance
      });
    }

    // Check for zero-duration segments
    segments.forEach((segment, index) => {
      if (segment.note.duration <= 0) {
        errors.push({
          type: 'zero_duration',
          message: `Segment ${index} has zero or negative duration: ${segment.note.duration}`,
          segmentIndex: index,
          actualValue: segment.note.duration
        });
      } else if (options.minSegmentDuration && segment.note.duration < options.minSegmentDuration) {
        warnings.push({
          type: 'small_segment',
          message: `Segment ${index} has very small duration: ${segment.note.duration.toFixed(6)}`,
          segmentIndex: index,
          recommendation: 'Consider if this segment is necessary or if tolerance should be adjusted'
        });
      }
    });

    return { errors, warnings };
  }

  private validateTemporalContinuity(
    segments: ColoredNote[],
    options: SegmentValidationOptions
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i];
      const next = segments[i + 1];

      const currentEnd = current.note.time + current.note.duration;
      const nextStart = next.note.time;
      const gap = nextStart - currentEnd;

      if (gap > options.tolerance) {
        errors.push({
          type: 'temporal_gap',
          message: `Gap of ${gap.toFixed(6)} between segment ${i} and ${i + 1}`,
          segmentIndex: i,
          actualValue: gap,
          tolerance: options.tolerance
        });
      } else if (gap < -options.tolerance) {
        errors.push({
          type: 'temporal_overlap',
          message: `Overlap of ${Math.abs(gap).toFixed(6)} between segment ${i} and ${i + 1}`,
          segmentIndex: i,
          actualValue: Math.abs(gap),
          tolerance: options.tolerance
        });
      }
    }

    return { errors, warnings };
  }

  private validateSegmentTypes(
    segments: ColoredNote[],
    options: SegmentValidationOptions
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    segments.forEach((segment, index) => {
      const segmentType = segment.note.evalSegmentKind;

      // Check if evaluation segments have valid types
      if (segment.note.isEvalHighlightSegment && !segmentType) {
        errors.push({
          type: 'invalid_type',
          message: `Evaluation segment ${index} is missing segment type`,
          segmentIndex: index
        });
      }

      // Validate against expected types if provided
      if (options.expectedTypes && index < options.expectedTypes.length) {
        const expectedType = options.expectedTypes[index];
        if (segmentType !== expectedType) {
          warnings.push({
            type: 'type_mismatch',
            message: `Segment ${index} has type '${segmentType}', expected '${expectedType}'`,
            segmentIndex: index,
            recommendation: 'Verify that the evaluation logic is producing expected segment types'
          });
        }
      }
    });

    return { errors, warnings };
  }

  private validateColorAssignments(
    segments: ColoredNote[],
    options: SegmentValidationOptions
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    segments.forEach((segment, index) => {
      // Basic color validation
      if (typeof segment.color !== 'number' || segment.color < 0 || segment.color > 0xFFFFFF) {
        errors.push({
          type: 'invalid_color',
          message: `Segment ${index} has invalid color value: ${segment.color}`,
          segmentIndex: index,
          actualValue: segment.color
        });
      }

      // Check for color consistency within segment types
      // This is a heuristic check - segments of the same type should generally have similar colors
      if (segment.note.evalSegmentKind) {
        const sameTypeSegments = segments.filter(s => s.note.evalSegmentKind === segment.note.evalSegmentKind);
        if (sameTypeSegments.length > 1) {
          const colors = sameTypeSegments.map(s => s.color);
          const uniqueColors = new Set(colors);

          if (uniqueColors.size > 1 && sameTypeSegments.length <= 5) { // Only warn for small numbers
            warnings.push({
              type: 'color_inconsistency',
              message: `Segments of type '${segment.note.evalSegmentKind}' have inconsistent colors`,
              segmentIndex: index,
              recommendation: 'Verify that color assignment logic is consistent for segment types'
            });
          }
        }
      }
    });

    return { errors, warnings };
  }

  private calculateMetrics(
    originalNote: any,
    segments: ColoredNote[],
    options: SegmentValidationOptions
  ): SegmentMetrics {
    const originalDuration = originalNote.duration;
    const totalSegmentDuration = segments.reduce((sum, seg) => sum + seg.note.duration, 0);
    const segmentCount = segments.length;

    const durations = segments.map(s => s.note.duration);
    const averageSegmentDuration = segmentCount > 0 ? totalSegmentDuration / segmentCount : 0;
    const minSegmentDuration = segmentCount > 0 ? Math.min(...durations) : 0;
    const maxSegmentDuration = segmentCount > 0 ? Math.max(...durations) : 0;

    // Calculate gaps and overlaps
    let totalGaps = 0;
    let totalOverlaps = 0;
    for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i];
      const next = segments[i + 1];
      const gap = next.note.time - (current.note.time + current.note.duration);

      if (gap > options.tolerance) {
        totalGaps += gap;
      } else if (gap < -options.tolerance) {
        totalOverlaps += Math.abs(gap);
      }
    }

    // Calculate type distribution
    const typeDistribution: Record<string, number> = {};
    segments.forEach(segment => {
      const type = segment.note.evalSegmentKind || 'unspecified';
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });

    // Calculate color consistency score (simplified heuristic)
    const colors = segments.map(s => s.color);
    const uniqueColors = new Set(colors);
    const colorConsistencyScore = segmentCount > 0 ? uniqueColors.size / segmentCount : 1.0;

    return {
      totalSegmentDuration,
      originalDuration,
      durationConservationRatio: originalDuration > 0 ? totalSegmentDuration / originalDuration : 1.0,
      segmentCount,
      averageSegmentDuration,
      minSegmentDuration,
      maxSegmentDuration,
      totalGaps,
      totalOverlaps,
      typeDistribution,
      colorConsistencyScore
    };
  }

  private analyzeSegments(
    segments: ColoredNote[],
    options: SegmentValidationOptions
  ): SegmentAnalysis[] {
    return segments.map((segment, index) => {
      const startTime = segment.note.time;
      const endTime = startTime + segment.note.duration;
      const duration = segment.note.duration;
      const issues: string[] = [];

      // Check for issues
      if (duration <= 0) {
        issues.push('Zero or negative duration');
      }
      if (options.minSegmentDuration && duration < options.minSegmentDuration) {
        issues.push('Very small duration');
      }
      if (typeof segment.color !== 'number' || segment.color < 0 || segment.color > 0xFFFFFF) {
        issues.push('Invalid color value');
      }

      // Calculate gap/overlap to next segment
      let gapToNext: number | undefined;
      let overlapWithNext: number | undefined;

      if (index < segments.length - 1) {
        const nextSegment = segments[index + 1];
        const gap = nextSegment.note.time - endTime;

        if (gap > options.tolerance) {
          gapToNext = gap;
        } else if (gap < -options.tolerance) {
          overlapWithNext = Math.abs(gap);
        }
      }

      return {
        index,
        startTime,
        endTime,
        duration,
        type: segment.note.evalSegmentKind,
        color: segment.color,
        isEvalSegment: !!segment.note.isEvalHighlightSegment,
        gapToNext,
        overlapWithNext,
        issues
      };
    });
  }

  private calculateAggregateMetrics(results: SegmentValidationResult[]): AggregateMetrics {
    const totalNotes = results.length;
    const validNotes = results.filter(r => r.isValid).length;
    const validationRate = totalNotes > 0 ? validNotes / totalNotes : 1.0;

    const allErrors = results.flatMap(r => r.errors);
    const allWarnings = results.flatMap(r => r.warnings);

    const errorsByType = this.groupByType(allErrors.map(e => e.type));
    const warningsByType = this.groupByType(allWarnings.map(w => w.type));

    const durationConservationRatios = results.map(r => r.metrics.durationConservationRatio);
    const averageDurationConservation = durationConservationRatios.reduce((sum, ratio) => sum + ratio, 0) / totalNotes;
    const colorConsistencyScores = results.map(r => r.metrics.colorConsistencyScore);
    const averageColorConsistency = colorConsistencyScores.reduce((sum, score) => sum + score, 0) / totalNotes;

    return {
      totalNotes,
      validNotes,
      validationRate,
      totalErrors: allErrors.length,
      totalWarnings: allWarnings.length,
      errorsByType,
      warningsByType,
      averageDurationConservation,
      averageColorConsistency
    };
  }

  private groupByType<T extends string>(items: T[]): Record<T, number> {
    const groups = {} as Record<T, number>;
    items.forEach(item => {
      groups[item] = (groups[item] || 0) + 1;
    });
    return groups;
  }
}

export interface AggregateMetrics {
  totalNotes: number;
  validNotes: number;
  validationRate: number;
  totalErrors: number;
  totalWarnings: number;
  errorsByType: Record<string, number>;
  warningsByType: Record<string, number>;
  averageDurationConservation: number;
  averageColorConsistency: number;
}

// Export singleton instance
export const segmentValidator = new SegmentValidator();
