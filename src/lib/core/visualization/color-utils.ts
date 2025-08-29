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

  // In color mode, dynamically generate based on REF and COMP colors
  const refRgb = hexToRgb(refColor);
  const compRgb = hexToRgb(compColor);

  // Calculate the midpoint between REF and COMP
  const midR = Math.floor((refRgb.r + compRgb.r) / 2);
  const midG = Math.floor((refRgb.g + compRgb.g) / 2);
  const midB = Math.floor((refRgb.b + compRgb.b) / 2);

  // Darken the midpoint color for better visibility
  // This creates a color that's related to both but darker/more distinct
  const factor = 0.8; // Darken to 80% brightness (brighter than before)
  const darkR = Math.floor(midR * factor);
  const darkG = Math.floor(midG * factor);
  const darkB = Math.floor(midB * factor);

  // Check if the result is too dark (near black)
  const luminance = getLuminance(darkR, darkG, darkB);
  if (luminance < 0.05) {
    // If too dark, lighten it slightly but keep it distinct
    const lightFactor = 0.9;
    return rgbToHex(
      Math.floor(midR * lightFactor),
      Math.floor(midG * lightFactor),
      Math.floor(midB * lightFactor)
    );
  }

  // Check contrast with both REF and COMP
  const darkHex = rgbToHex(darkR, darkG, darkB);
  const refContrast = getContrastRatio(refColor, darkHex);
  const compContrast = getContrastRatio(compColor, darkHex);

  // If contrast is too low with either color, adjust
  if (refContrast < 2.0 || compContrast < 2.0) {
    // Create a complementary color for better distinction
    // Rotate hue by 180 degrees in a simple way
    const invertR = 255 - midR;
    const invertG = 255 - midG;
    const invertB = 255 - midB;

    // Apply darkening to the inverted color
    return rgbToHex(
      Math.floor(invertR * 0.6),
      Math.floor(invertG * 0.6),
      Math.floor(invertB * 0.6)
    );
  }

  return darkHex;
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
