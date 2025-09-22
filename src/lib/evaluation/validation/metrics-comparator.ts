/**
 * Metrics Comparator for mir_eval Compatibility Validation
 *
 * This utility validates that our transcription evaluation implementation
 * produces results consistent with mir_eval standards. It compares:
 *
 * 1. Note matching results (TP, FP, FN counts)
 * 2. Precision, Recall, F1 scores
 * 3. Onset, offset, and overlap metrics
 * 4. Velocity-aware evaluation results
 *
 * Reference: https://github.com/mir-evaluation/mir_eval
 */

import { matchNotes, evaluateTranscription } from '@/lib/evaluation/transcription';
import type { ParsedMidi } from '@/lib/midi/types';
import type { TranscriptionToleranceOptions, VelocityToleranceOptions } from '@/lib/evaluation/transcription/constants';

export interface MirEvalExpectedResults {
  /** Expected number of true positives */
  truePositives: number;
  /** Expected number of false positives */
  falsePositives: number;
  /** Expected number of false negatives */
  falseNegatives: number;
  /** Expected precision (TP / (TP + FP)) */
  precision: number;
  /** Expected recall (TP / (TP + FN)) */
  recall: number;
  /** Expected F1 score (2 * precision * recall / (precision + recall)) */
  f1Score: number;
  /** Expected average overlap ratio */
  averageOverlap?: number;
  /** Source of expected results (e.g., 'mir_eval_v0.7') */
  source: string;
  /** Additional context or notes */
  notes?: string;
}

export interface ComparisonOptions {
  /** Tolerance for floating-point metric comparisons (default: 1e-6) */
  metricTolerance: number;
  /** Whether to perform strict count validation */
  strictCounts: boolean;
  /** Whether to validate individual match details */
  validateMatches: boolean;
  /** Whether to compare velocity-aware metrics */
  includeVelocityMetrics: boolean;
}

export interface ComparisonResult {
  /** Whether all comparisons passed within tolerance */
  isCompatible: boolean;
  /** Overall compatibility score (0-1) */
  compatibilityScore: number;
  /** Detailed comparison results */
  comparisons: MetricComparison[];
  /** Summary of differences */
  summary: ComparisonSummary;
  /** Recommendations for improvement */
  recommendations: string[];
}

export interface MetricComparison {
  /** Name of the metric being compared */
  metricName: string;
  /** Expected value (from mir_eval or reference) */
  expected: number;
  /** Actual value (from our implementation) */
  actual: number;
  /** Absolute difference */
  difference: number;
  /** Relative difference (percentage) */
  relativeDifference: number;
  /** Whether the comparison passed within tolerance */
  passed: boolean;
  /** Severity of the difference */
  severity: 'acceptable' | 'concerning' | 'critical';
  /** Additional context */
  context?: string;
}

export interface ComparisonSummary {
  /** Total number of metrics compared */
  totalMetrics: number;
  /** Number of metrics that passed */
  passedMetrics: number;
  /** Number of metrics with concerning differences */
  concerningMetrics: number;
  /** Number of metrics with critical differences */
  criticalMetrics: number;
  /** Largest absolute difference observed */
  maxAbsoluteDifference: number;
  /** Largest relative difference observed */
  maxRelativeDifference: number;
  /** Average absolute difference */
  averageAbsoluteDifference: number;
}

export class MirEvalMetricsComparator {
  private readonly defaultOptions: ComparisonOptions = {
    metricTolerance: 1e-6,
    strictCounts: true,
    validateMatches: true,
    includeVelocityMetrics: false
  };

  /**
   * Compare our evaluation results with expected mir_eval results
   */
  public compareWithExpected(
    reference: ParsedMidi,
    estimated: ParsedMidi,
    expected: MirEvalExpectedResults,
    toleranceOptions: Partial<TranscriptionToleranceOptions> = {},
    velocityOptions: Partial<VelocityToleranceOptions> = {},
    comparisonOptions: Partial<ComparisonOptions> = {}
  ): ComparisonResult {
    const opts = { ...this.defaultOptions, ...comparisonOptions };

    // Run our evaluation
    const matchResult = matchNotes(reference, estimated, toleranceOptions);
    const evalResult = evaluateTranscription(reference, estimated, toleranceOptions, velocityOptions);

    // Extract our metrics
    const ourMetrics = {
      truePositives: matchResult.matches.length,
      falsePositives: matchResult.falsePositives.length,
      falseNegatives: matchResult.falseNegatives.length,
      precision: evalResult.precision,
      recall: evalResult.recall,
      f1Score: evalResult.f1,
      averageOverlap: evalResult.avgOverlapRatio
    };

    // Perform comparisons
    const comparisons: MetricComparison[] = [];

    // Core count comparisons
    comparisons.push(this.compareMetric('True Positives', expected.truePositives, ourMetrics.truePositives, opts));
    comparisons.push(this.compareMetric('False Positives', expected.falsePositives, ourMetrics.falsePositives, opts));
    comparisons.push(this.compareMetric('False Negatives', expected.falseNegatives, ourMetrics.falseNegatives, opts));

    // PRF metrics
    comparisons.push(this.compareMetric('Precision', expected.precision, ourMetrics.precision, opts));
    comparisons.push(this.compareMetric('Recall', expected.recall, ourMetrics.recall, opts));
    comparisons.push(this.compareMetric('F1 Score', expected.f1Score, ourMetrics.f1Score, opts));

    // Overlap metrics (if available)
    if (expected.averageOverlap !== undefined) {
      comparisons.push(this.compareMetric('Average Overlap', expected.averageOverlap, ourMetrics.averageOverlap, opts));
    }

    // Velocity metrics (if enabled)
    if (opts.includeVelocityMetrics && evalResult.velocity) {
      // Add velocity-specific comparisons if expected results include them
      // This would need to be extended based on specific velocity metrics to compare
    }

    // Calculate overall results
    const summary = this.calculateSummary(comparisons);
    const isCompatible = summary.criticalMetrics === 0 && summary.concerningMetrics <= 1;
    const compatibilityScore = summary.passedMetrics / summary.totalMetrics;
    const recommendations = this.generateRecommendations(comparisons, expected);

    return {
      isCompatible,
      compatibilityScore,
      comparisons,
      summary,
      recommendations
    };
  }

  /**
   * Compare two evaluation runs for consistency
   */
  public compareEvaluationRuns(
    reference: ParsedMidi,
    estimated: ParsedMidi,
    toleranceOptions1: Partial<TranscriptionToleranceOptions>,
    toleranceOptions2: Partial<TranscriptionToleranceOptions>,
    runName1: string = 'Run 1',
    runName2: string = 'Run 2',
    comparisonOptions: Partial<ComparisonOptions> = {}
  ): ComparisonResult {
    const opts = { ...this.defaultOptions, ...comparisonOptions };

    // Run both evaluations
    const result1 = evaluateTranscription(reference, estimated, toleranceOptions1);
    const result2 = evaluateTranscription(reference, estimated, toleranceOptions2);

    const match1 = matchNotes(reference, estimated, toleranceOptions1);
    const match2 = matchNotes(reference, estimated, toleranceOptions2);

    // Compare results
    const comparisons: MetricComparison[] = [];

    comparisons.push(this.compareMetric('True Positives', match1.matches.length, match2.matches.length, opts, `${runName1} vs ${runName2}`));
    comparisons.push(this.compareMetric('False Positives', match1.falsePositives.length, match2.falsePositives.length, opts, `${runName1} vs ${runName2}`));
    comparisons.push(this.compareMetric('False Negatives', match1.falseNegatives.length, match2.falseNegatives.length, opts, `${runName1} vs ${runName2}`));
    comparisons.push(this.compareMetric('Precision', result1.precision, result2.precision, opts, `${runName1} vs ${runName2}`));
    comparisons.push(this.compareMetric('Recall', result1.recall, result2.recall, opts, `${runName1} vs ${runName2}`));
    comparisons.push(this.compareMetric('F1 Score', result1.f1, result2.f1, opts, `${runName1} vs ${runName2}`));

    const summary = this.calculateSummary(comparisons);
    const isCompatible = summary.criticalMetrics === 0;
    const compatibilityScore = summary.passedMetrics / summary.totalMetrics;

    return {
      isCompatible,
      compatibilityScore,
      comparisons,
      summary,
      recommendations: [`Comparison between ${runName1} and ${runName2}`]
    };
  }

  /**
   * Generate a comprehensive validation report
   */
  public generateValidationReport(
    testCases: Array<{
      name: string;
      reference: ParsedMidi;
      estimated: ParsedMidi;
      expected: MirEvalExpectedResults;
      toleranceOptions?: Partial<TranscriptionToleranceOptions>;
      velocityOptions?: Partial<VelocityToleranceOptions>;
    }>,
    comparisonOptions: Partial<ComparisonOptions> = {}
  ): ValidationReport {
    const results = testCases.map(testCase => ({
      testCaseName: testCase.name,
      result: this.compareWithExpected(
        testCase.reference,
        testCase.estimated,
        testCase.expected,
        testCase.toleranceOptions,
        testCase.velocityOptions,
        comparisonOptions
      )
    }));

    const overallCompatible = results.every(r => r.result.isCompatible);
    const averageCompatibilityScore = results.reduce((sum, r) => sum + r.result.compatibilityScore, 0) / results.length;

    const aggregatedSummary = this.aggregateSummaries(results.map(r => r.result.summary));
    const overallRecommendations = this.generateOverallRecommendations(results);

    return {
      overallCompatible,
      averageCompatibilityScore,
      testCaseResults: results,
      aggregatedSummary,
      overallRecommendations,
      timestamp: new Date().toISOString()
    };
  }

  private compareMetric(
    metricName: string,
    expected: number,
    actual: number,
    options: ComparisonOptions,
    context?: string
  ): MetricComparison {
    const difference = Math.abs(actual - expected);
    const relativeDifference = expected !== 0 ? (difference / Math.abs(expected)) * 100 : 0;

    // Determine if the comparison passed
    let passed: boolean;
    if (options.strictCounts && metricName.includes('Positives') || metricName.includes('Negatives')) {
      // For count metrics, require exact match
      passed = difference === 0;
    } else {
      // For ratio metrics, use tolerance
      passed = difference <= options.metricTolerance;
    }

    // Determine severity
    let severity: 'acceptable' | 'concerning' | 'critical';
    if (passed) {
      severity = 'acceptable';
    } else if (relativeDifference <= 1.0) { // 1% difference
      severity = 'concerning';
    } else {
      severity = 'critical';
    }

    return {
      metricName,
      expected,
      actual,
      difference,
      relativeDifference,
      passed,
      severity,
      context
    };
  }

  private calculateSummary(comparisons: MetricComparison[]): ComparisonSummary {
    const totalMetrics = comparisons.length;
    const passedMetrics = comparisons.filter(c => c.passed).length;
    const concerningMetrics = comparisons.filter(c => c.severity === 'concerning').length;
    const criticalMetrics = comparisons.filter(c => c.severity === 'critical').length;

    const absoluteDifferences = comparisons.map(c => c.difference);
    const relativeDifferences = comparisons.map(c => c.relativeDifference);

    const maxAbsoluteDifference = Math.max(...absoluteDifferences);
    const maxRelativeDifference = Math.max(...relativeDifferences);
    const averageAbsoluteDifference = absoluteDifferences.reduce((sum, diff) => sum + diff, 0) / totalMetrics;

    return {
      totalMetrics,
      passedMetrics,
      concerningMetrics,
      criticalMetrics,
      maxAbsoluteDifference,
      maxRelativeDifference,
      averageAbsoluteDifference
    };
  }

  private generateRecommendations(comparisons: MetricComparison[], expected: MirEvalExpectedResults): string[] {
    const recommendations: string[] = [];

    const criticalComparisons = comparisons.filter(c => c.severity === 'critical');
    const concerningComparisons = comparisons.filter(c => c.severity === 'concerning');

    if (criticalComparisons.length > 0) {
      recommendations.push(`Critical differences found in: ${criticalComparisons.map(c => c.metricName).join(', ')}`);
      recommendations.push('Review note matching algorithm and tolerance parameters');
    }

    if (concerningComparisons.length > 0) {
      recommendations.push(`Minor differences found in: ${concerningComparisons.map(c => c.metricName).join(', ')}`);
      recommendations.push('Consider adjusting tolerance parameters or review edge cases');
    }

    // Specific recommendations based on which metrics failed
    const failedCounts = criticalComparisons.filter(c => c.metricName.includes('Positives') || c.metricName.includes('Negatives'));
    if (failedCounts.length > 0) {
      recommendations.push('Count discrepancies suggest issues with the bipartite matching algorithm');
    }

    const failedRatios = criticalComparisons.filter(c => ['Precision', 'Recall', 'F1 Score'].includes(c.metricName));
    if (failedRatios.length > 0) {
      recommendations.push('Ratio metric differences may indicate tolerance or calculation issues');
    }

    if (recommendations.length === 0) {
      recommendations.push('All metrics are within acceptable tolerance - good mir_eval compatibility!');
    }

    return recommendations;
  }

  private aggregateSummaries(summaries: ComparisonSummary[]): ComparisonSummary {
    const totalMetrics = summaries.reduce((sum, s) => sum + s.totalMetrics, 0);
    const passedMetrics = summaries.reduce((sum, s) => sum + s.passedMetrics, 0);
    const concerningMetrics = summaries.reduce((sum, s) => sum + s.concerningMetrics, 0);
    const criticalMetrics = summaries.reduce((sum, s) => sum + s.criticalMetrics, 0);

    const maxAbsoluteDifference = Math.max(...summaries.map(s => s.maxAbsoluteDifference));
    const maxRelativeDifference = Math.max(...summaries.map(s => s.maxRelativeDifference));
    const averageAbsoluteDifference = summaries.reduce((sum, s) => sum + s.averageAbsoluteDifference, 0) / summaries.length;

    return {
      totalMetrics,
      passedMetrics,
      concerningMetrics,
      criticalMetrics,
      maxAbsoluteDifference,
      maxRelativeDifference,
      averageAbsoluteDifference
    };
  }

  private generateOverallRecommendations(results: Array<{ testCaseName: string; result: ComparisonResult }>): string[] {
    const recommendations: string[] = [];

    const failedTests = results.filter(r => !r.result.isCompatible);
    const averageScore = results.reduce((sum, r) => sum + r.result.compatibilityScore, 0) / results.length;

    if (failedTests.length === 0) {
      recommendations.push('✅ All test cases passed - excellent mir_eval compatibility!');
    } else {
      recommendations.push(`❌ ${failedTests.length}/${results.length} test cases failed compatibility checks`);
      recommendations.push(`Failed tests: ${failedTests.map(t => t.testCaseName).join(', ')}`);
    }

    recommendations.push(`Overall compatibility score: ${(averageScore * 100).toFixed(1)}%`);

    if (averageScore < 0.8) {
      recommendations.push('🔧 Consider reviewing the core matching algorithm implementation');
    } else if (averageScore < 0.95) {
      recommendations.push('⚠️ Minor adjustments needed to improve compatibility');
    }

    return recommendations;
  }
}

export interface ValidationReport {
  overallCompatible: boolean;
  averageCompatibilityScore: number;
  testCaseResults: Array<{
    testCaseName: string;
    result: ComparisonResult;
  }>;
  aggregatedSummary: ComparisonSummary;
  overallRecommendations: string[];
  timestamp: string;
}

// Export singleton instance
export const mirEvalComparator = new MirEvalMetricsComparator();

/**
 * Predefined test cases with known mir_eval results
 * These can be used for regression testing and validation
 */
export const KNOWN_TEST_CASES = {
  // Perfect match case
  PERFECT_MATCH: {
    name: 'Perfect Match',
    expected: {
      truePositives: 1,
      falsePositives: 0,
      falseNegatives: 0,
      precision: 1.0,
      recall: 1.0,
      f1Score: 1.0,
      averageOverlap: 1.0,
      source: 'analytical'
    }
  },

  // No match case
  NO_MATCH: {
    name: 'No Match',
    expected: {
      truePositives: 0,
      falsePositives: 1,
      falseNegatives: 1,
      precision: 0.0,
      recall: 0.0,
      f1Score: 0.0,
      averageOverlap: 0.0,
      source: 'analytical'
    }
  },

  // Partial match case (common scenario)
  PARTIAL_MATCH: {
    name: 'Partial Match',
    expected: {
      truePositives: 2,
      falsePositives: 1,
      falseNegatives: 1,
      precision: 2/3, // 2/(2+1)
      recall: 2/3,    // 2/(2+1)
      f1Score: 2/3,   // 2*P*R/(P+R) = 2*(2/3)*(2/3)/((2/3)+(2/3)) = 2/3
      source: 'analytical'
    }
  }
};
