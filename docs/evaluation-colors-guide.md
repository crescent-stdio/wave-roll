# Evaluation Colors Guide

## Overview

This document describes the color system used in the evaluation modes of WaveRoll MIDI visualizer.

## Color Modes

### 1. Standard Color Mode (`eval-intersection`, `eval-exclusive`)

Colors used for highlighting matched segments:

- **Intersection/Match**: `#60A5FA` (Sky-400) - Soft blue
- **Exclusive/Difference**: `#FB7185` (Rose-400) - Soft rose  
- **Ambiguous**: Dynamically generated based on REF and COMP colors for optimal visibility

### 2. Gray Mode (`eval-intersection-gray`, `eval-exclusive-gray`)

Distinct gray levels for better visual separation:

- **Intersection**: `#B0B0B0` - Light gray
- **Exclusive**: `#707070` - Medium gray
- **Ambiguous**: `#7A6F66` - Warm gray (distinct from pure grays)

### 3. Reference Missed Only Mode (`eval-ref-missed`)

Dynamic color assignment:

- **Matched Exclusive**: Uses reference file's original color
- **Non-matched Notes**: Dynamic contrasting gray calculated based on reference color
  - No hatch/pattern overlay for clean appearance
  - Minimum contrast ratio of 3.5:1 for visibility
  - Gray values bounded between #404040 (min) and #C0C0C0 (max) to prevent near-white grays

## Implementation Details

### Color Utility Functions

Located in `/src/lib/core/visualization/color-utils.ts`:

```typescript
// Get contrasting gray for any reference color
getContrastingGray(refColor: string, minContrast: number): string

// Get distinct gray levels
getDistinctGrays(count: number): string[]

// Get dynamic ambiguous color based on REF and COMP colors
// In color mode: generates a color that's distinct from both REF and COMP
// In gray mode: returns #7A6F66 (warm gray)
getAmbiguousColor(refColor: string, compColor: string, mode: 'color' | 'gray'): string
```

### Reference Missed Color Logic

Located in `/src/lib/core/visualization/piano-roll/utils/ref-missed-colors.ts`:

```typescript
// Get appropriate color for ref-missed mode
getRefMissedColor(
  note: NoteData,
  isMatched: boolean,
  isExclusive: boolean,
  refColor: number,
  fileColors?: Record<string, number>
): number

// Determine overlay visibility
shouldShowOverlayInRefMissed(isMatched: boolean): boolean

// Get cached contrasting gray
getCachedContrastingGray(refColor: number): number
```

## Visual Distinctions

### Overlay Patterns

Different patterns help distinguish evaluation categories:

- **Intersection**: Diagonal lines (45°) - "up" pattern
- **Exclusive**: Diagonal lines (-45°) - "down" pattern
- **Ambiguous**: Cross-hatch pattern - "cross" pattern

### Overlay Strength

Alpha values for different categories:

- **Intersection**: 0.20 (medium)
- **Exclusive**: 0.24 (softer)
- **Ambiguous**: 0.40 (stronger for visibility)

## Usage in Code

### Setting Evaluation Colors

```typescript
// In notes renderer
if (isGrayMode) {
  if (kind === "exclusive") {
    tint = parseInt(GRAY_EVAL_EXCLUSIVE.replace("#", ""), 16);
  } else if (kind === "ambiguous") {
    tint = parseInt(GRAY_EVAL_AMBIGUOUS.replace("#", ""), 16);
  } else {
    tint = parseInt(GRAY_EVAL_INTERSECTION.replace("#", ""), 16);
  }
} else {
  // Color mode logic...
}
```

### Applying Dynamic Contrast

```typescript
// For ref-missed mode
const grayColor = getCachedContrastingGray(referenceColor);
// Apply to non-matched notes with no overlay
note.noOverlay = true; // Clean fill
sprite.tint = grayColor;
```

## Accessibility Considerations

1. **Contrast Ratios**: All colors maintain WCAG AA compliance (minimum 3:1 for UI elements)
2. **Color Vision Deficiency**: Gray modes provide alternative visualization
3. **Dynamic Adjustment**: Ref-missed mode automatically adjusts gray based on reference color luminance

## Color Constants

All color constants are defined in `/src/lib/core/constants/index.ts`:

```typescript
export const COLOR_EVAL_HIGHLIGHT = "#60A5FA";
export const COLOR_EVAL_EXCLUSIVE = "#FB7185";
// COLOR_EVAL_AMBIGUOUS is now dynamically generated
export const GRAY_EVAL_INTERSECTION = "#B0B0B0";
export const GRAY_EVAL_EXCLUSIVE = "#707070";
export const GRAY_EVAL_AMBIGUOUS = "#7A6F66";
```