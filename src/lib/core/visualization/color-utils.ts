/**
 * Color utility functions for dynamic contrast and accessibility
 */

/**
 * Convert hex color to RGB components
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

/**
 * Convert RGB to hex color
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * Calculate relative luminance (WCAG 2.1)
 * @param r Red component (0-255)
 * @param g Green component (0-255)
 * @param b Blue component (0-255)
 * @returns Relative luminance (0-1)
 */
export function getLuminance(r: number, g: number, b: number): number {
  const rsRGB = r / 255;
  const gsRGB = g / 255;
  const bsRGB = b / 255;

  const rLinear =
    rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
  const gLinear =
    gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
  const bLinear =
    bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * Calculate contrast ratio between two colors (WCAG 2.1)
 * @returns Contrast ratio (1-21)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Generate a contrasting gray color for a given reference color
 * Ensures sufficient contrast for visibility
 *
 * @param refColor Reference color in hex format
 * @param minContrast Minimum contrast ratio (default 3.0 for UI elements)
 * @param preferDark Whether to prefer darker gray (default: auto based on ref luminance)
 * @returns Hex color of contrasting gray
 */
export function getContrastingGray(
  refColor: string,
  minContrast: number = 3.0,
  preferDark?: boolean
): string {
  const refRgb = hexToRgb(refColor);
  const refLum = getLuminance(refRgb.r, refRgb.g, refRgb.b);

  // Determine if we should use light or dark gray
  // For very light colors, use darker gray; for dark colors, use lighter gray
  const useDark = preferDark !== undefined ? preferDark : refLum > 0.3;

  // Set bounds to avoid extreme values that might blend with background
  // Minimum gray: 64 (dark enough to see on white)
  // Maximum gray: 192 (light enough to see on black, but not too close to white)
  const MIN_GRAY = 64; // #404040
  const MAX_GRAY = 192; // #C0C0C0

  let bestGray: number;

  if (useDark) {
    // For light reference colors, use darker gray
    // Start from a moderately dark value
    bestGray = 96; // #606060

    // Adjust based on luminance
    if (refLum > 0.7) {
      // Very light reference - use darker gray
      bestGray = 80; // #505050
    } else if (refLum > 0.5) {
      // Medium-light reference
      bestGray = 96; // #606060
    } else {
      // Medium reference
      bestGray = 112; // #707070
    }
  } else {
    // For dark reference colors, use lighter gray
    // But not too light to avoid blending with white background
    bestGray = 144; // #909090

    // Adjust based on luminance
    if (refLum < 0.1) {
      // Very dark reference - use lighter gray
      bestGray = 160; // #A0A0A0
    } else if (refLum < 0.2) {
      // Dark reference
      bestGray = 144; // #909090
    } else {
      // Medium-dark reference
      bestGray = 128; // #808080
    }
  }

  // Ensure minimum contrast
  const grayLum = getLuminance(bestGray, bestGray, bestGray);
  const contrast =
    refLum > grayLum
      ? (refLum + 0.05) / (grayLum + 0.05)
      : (grayLum + 0.05) / (refLum + 0.05);

  // If contrast is insufficient, adjust
  if (contrast < minContrast) {
    if (useDark && bestGray > MIN_GRAY) {
      // Make it darker
      bestGray = Math.max(MIN_GRAY, bestGray - 32);
    } else if (!useDark && bestGray < MAX_GRAY) {
      // Make it lighter
      bestGray = Math.min(MAX_GRAY, bestGray + 32);
    }
  }

  // Clamp to valid range
  bestGray = Math.max(MIN_GRAY, Math.min(MAX_GRAY, bestGray));

  return rgbToHex(bestGray, bestGray, bestGray);
}

/**
 * Generate distinct gray levels for different evaluation categories
 * Ensures each gray is distinguishable from others
 */
export function getDistinctGrays(count: number = 3): string[] {
  const grays: string[] = [];

  if (count <= 0) return grays;

  // Predefined distinct gray levels
  const levels = [
    "#1a1a1a", // Very dark
    "#404040", // Dark
    "#666666", // Medium dark
    "#8c8c8c", // Medium
    "#b3b3b3", // Medium light
    "#d9d9d9", // Light
    "#f0f0f0", // Very light
  ];

  // Select evenly spaced grays
  const step = Math.max(1, Math.floor(levels.length / count));
  for (let i = 0; i < count && i * step < levels.length; i++) {
    grays.push(levels[i * step]);
  }

  return grays;
}

/**
 * Adjust color brightness
 * @param color Hex color
 * @param factor Brightness factor (< 1 = darker, > 1 = lighter)
 */
export function adjustBrightness(color: string, factor: number): string {
  const rgb = hexToRgb(color);

  const r = Math.min(255, Math.max(0, Math.floor(rgb.r * factor)));
  const g = Math.min(255, Math.max(0, Math.floor(rgb.g * factor)));
  const b = Math.min(255, Math.max(0, Math.floor(rgb.b * factor)));

  return rgbToHex(r, g, b);
}

/**
 * Mix two colors
 * @param color1 First hex color
 * @param color2 Second hex color
 * @param ratio Mix ratio (0 = color1, 1 = color2)
 */
export function mixColors(
  color1: string,
  color2: string,
  ratio: number = 0.5
): string {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  const r = Math.floor(rgb1.r * (1 - ratio) + rgb2.r * ratio);
  const g = Math.floor(rgb1.g * (1 - ratio) + rgb2.g * ratio);
  const b = Math.floor(rgb1.b * (1 - ratio) + rgb2.b * ratio);

  return rgbToHex(r, g, b);
}

/**
 * Get an appropriate ambiguous color based on reference and comparison colors
 * Creates a visually distinct color that maintains good contrast
 */
export function getAmbiguousColor(
  refColor: string,
  compColor: string,
  mode: "color" | "gray" = "color"
): string {
  if (mode === "gray") {
    // In gray mode, use a distinct medium gray with slight warm tint
    return "#7a6f66"; // Warm gray that's distinct from pure grays
  }

  // Improved: pick a hue that is far from BOTH REF and COMP.
  // Strategy:
  // 1) Compute circular average hue Havg of REF/COMP.
  // 2) Choose ambiguous hue = Havg + 180° (opposite of their middle).
  // 3) If REF/COMP are nearly opposite (average magnitude ≈ 0), rotate 90° off REF.
  // 4) Tune saturation/value and enforce contrast >= 3.0 against both.

  // Lazy import to avoid circular deps; replicate tiny HSV helpers locally.
  const toHsv = (hex: string): [number, number, number] => {
    const { r, g, b } = hexToRgb(hex);
    // Inline rgbToHsv to avoid extra dependency and retain determinism
    let rr = r / 255,
      gg = g / 255,
      bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === rr) h = ((gg - bb) / d) % 6;
      else if (max === gg) h = (bb - rr) / d + 2;
      else h = (rr - gg) / d + 4;
    }
    const hue = (h < 0 ? h + 6 : h) * 60;
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return [hue, s, v];
  };

  const fromHsv = (h: number, s: number, v: number): string => {
    const c = v * s;
    const hh = (h % 360) / 60;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    let r1 = 0,
      g1 = 0,
      b1 = 0;
    if (hh >= 0 && hh < 1) {
      r1 = c;
      g1 = x;
    } else if (hh >= 1 && hh < 2) {
      r1 = x;
      g1 = c;
    } else if (hh >= 2 && hh < 3) {
      g1 = c;
      b1 = x;
    } else if (hh >= 3 && hh < 4) {
      g1 = x;
      b1 = c;
    } else if (hh >= 4 && hh < 5) {
      r1 = x;
      b1 = c;
    } else {
      r1 = c;
      b1 = x;
    }
    const m = v - c;
    const r = Math.round((r1 + m) * 255);
    const g = Math.round((g1 + m) * 255);
    const b = Math.round((b1 + m) * 255);
    return rgbToHex(r, g, b);
  };

  const [h1, s1, v1] = toHsv(refColor);
  const [h2, s2, v2] = toHsv(compColor);
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => ((r * 180) / Math.PI + 360) % 360;
  const x = Math.cos(toRad(h1)) + Math.cos(toRad(h2));
  const y = Math.sin(toRad(h1)) + Math.sin(toRad(h2));
  const mag = Math.sqrt(x * x + y * y);
  const avgHue = toDeg(Math.atan2(y, x));
  // Opposite of the average
  let ambHue = (avgHue + 180) % 360;
  if (mag < 0.2) {
    // Nearly opposite colors: rotate 90° from REF to avoid either
    ambHue = (h1 + 90) % 360;
  }

  // If ambiguous hue is still too close (< 30°) to any, push it away by 60°
  const hueDist = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  if (hueDist(ambHue, h1) < 30) ambHue = (ambHue + 60) % 360;
  if (hueDist(ambHue, h2) < 30) ambHue = (ambHue + 60) % 360;

  // Choose moderately vivid S and mid-high V for visibility
  let ambS = Math.min(0.85, Math.max(0.55, Math.max(s1, s2) * 0.85));
  let ambV = Math.min(0.8, Math.max(0.6, (v1 + v2) / 2 * 0.9));

  let candidate = fromHsv(ambHue, ambS, ambV);
  const minContrast = (hex: string) =>
    Math.min(getContrastRatio(hex, refColor), getContrastRatio(hex, compColor));

  // Enforce minimum contrast 3.0:1 against both REF and COMP
  let best = candidate;
  let bestScore = minContrast(candidate);
  const TARGET = 3.0;
  let tries = 0;
  while (bestScore < TARGET && tries < 10) {
    // Try lightening and darkening
    const vUp = Math.min(0.95, ambV + 0.08);
    const vDn = Math.max(0.35, ambV - 0.08);
    const cUp = fromHsv(ambHue, ambS, vUp);
    const cDn = fromHsv(ambHue, ambS, vDn);
    const sUp = minContrast(cUp);
    const sDn = minContrast(cDn);
    if (sUp >= sDn) {
      ambV = vUp;
      candidate = cUp;
      bestScore = sUp;
    } else {
      ambV = vDn;
      candidate = cDn;
      bestScore = sDn;
    }
    // If still low, also adjust hue slightly away from nearer color
    if (bestScore < TARGET) {
      const d1 = hueDist(ambHue, h1);
      const d2 = hueDist(ambHue, h2);
      ambHue = (ambHue + (d1 < d2 ? 20 : -20) + 360) % 360;
      candidate = fromHsv(ambHue, ambS, ambV);
      bestScore = minContrast(candidate);
    }
    tries++;
  }

  return candidate;
}

/**
 * Convert a color to its grayscale equivalent
 */
export function toGrayscale(color: string): string {
  const rgb = hexToRgb(color);
  // Use luminance formula for perceptually accurate grayscale
  const gray = Math.floor(0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b);
  return rgbToHex(gray, gray, gray);
}

/**
 * Check if a color is considered "light" or "dark"
 */
export function isLightColor(color: string): boolean {
  const rgb = hexToRgb(color);
  const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
  return luminance > 0.5;
}

/**
 * Get optimal text color (black or white) for a given background
 */
export function getTextColorForBackground(bgColor: string): string {
  return isLightColor(bgColor) ? "#000000" : "#ffffff";
}
