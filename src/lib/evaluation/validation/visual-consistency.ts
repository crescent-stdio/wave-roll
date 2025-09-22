import type { ColoredNote } from "@/lib/core/visualization/types";

export interface VisualConsistencyReport {
  isConsistent: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalSegments: number;
    evalSegments: number;
    byType: Record<string, number>;
  };
}

export function checkVisualConsistency(segments: ColoredNote[]): VisualConsistencyReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const byType: Record<string, number> = {};
  let evalSegments = 0;

  for (const seg of segments) {
    if (typeof seg.color !== "number" || seg.color < 0 || seg.color > 0xffffff) {
      errors.push(`Invalid color value: ${seg.color}`);
    }
    const kind = seg.note.evalSegmentKind ?? "unspecified";
    byType[kind] = (byType[kind] || 0) + 1;
    if (seg.note.isEvalHighlightSegment) {
      evalSegments++;
    }
  }

  return {
    isConsistent: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalSegments: segments.length,
      evalSegments,
      byType,
    },
  };
}


