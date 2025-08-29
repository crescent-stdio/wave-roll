/**
 * Color utilities for Reference Missed Only evaluation mode
 * 
 * In this mode:
 * - Matched exclusive notes use reference's original color
 * - Non-matched notes use a contrasting gray that's visible against the reference color
 * - Gray is dynamically calculated to ensure visibility
 */

import { getContrastingGray, hexToRgb } from "@/lib/core/visualization/color-utils";
import { NoteData } from "@/lib/core/utils/midi/types";

/**
 * Get the appropriate color for a note in ref-missed mode
 * 
 * @param note - The note to color
 * @param isMatched - Whether this note is part of a match
 * @param isExclusive - Whether this is an exclusive match
 * @param refColor - The reference file's original color
 * @param fileColors - Map of file IDs to their original colors
 * @returns Color as a hex number for rendering
 */
export function getRefMissedColor(
  note: NoteData,
  isMatched: boolean,
  isExclusive: boolean,
  refColor: number,
  fileColors?: Record<string, number>
): number {
  // Matched exclusive notes use reference color
  if (isMatched && isExclusive) {
    return refColor;
  }
  
  // Convert reference color to hex string for contrast calculation
  const refHex = "#" + refColor.toString(16).padStart(6, "0");
  
  // Get a contrasting gray that's visible against reference color
  // No hatch/pattern overlay for cleaner appearance
  const grayHex = getContrastingGray(refHex, 3.5); // Higher contrast for better visibility
  
  // Convert back to number for PIXI
  return parseInt(grayHex.replace("#", ""), 16);
}

/**
 * Determine if a note should have overlay patterns in ref-missed mode
 * 
 * @param isMatched - Whether this note is part of a match
 * @returns true if overlay should be shown, false for clean fill
 */
export function shouldShowOverlayInRefMissed(isMatched: boolean): boolean {
  // No overlays for unmatched notes - clean gray fill
  // Matched notes can have overlay for distinction
  return isMatched;
}

/**
 * Get dynamic gray color based on multiple reference colors
 * This is useful when there are multiple reference files
 * 
 * @param refColors - Array of reference colors to consider
 * @returns Optimal gray color that contrasts with all references
 */
export function getMultiRefGray(refColors: number[]): number {
  if (refColors.length === 0) {
    // Default medium gray
    return 0x808080;
  }
  
  // Calculate average luminance of all reference colors
  let totalLuminance = 0;
  for (const color of refColors) {
    const hex = "#" + color.toString(16).padStart(6, "0");
    const rgb = hexToRgb(hex);
    // Simple luminance calculation
    const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    totalLuminance += lum;
  }
  const avgLuminance = totalLuminance / refColors.length;
  
  // Choose gray based on average luminance
  // If references are generally light, use dark gray
  // If references are generally dark, use light gray
  if (avgLuminance > 0.5) {
    // References are light - use dark gray
    return 0x404040;
  } else {
    // References are dark - use light gray
    return 0xB0B0B0;
  }
}

/**
 * Cache for computed contrasting grays to avoid recalculation
 */
const contrastCache = new Map<number, number>();

/**
 * Get cached contrasting gray for a reference color
 * 
 * @param refColor - Reference color as hex number
 * @returns Contrasting gray as hex number
 */
export function getCachedContrastingGray(refColor: number): number {
  if (contrastCache.has(refColor)) {
    return contrastCache.get(refColor)!;
  }
  
  const refHex = "#" + refColor.toString(16).padStart(6, "0");
  const grayHex = getContrastingGray(refHex, 3.5);
  const grayNum = parseInt(grayHex.replace("#", ""), 16);
  
  contrastCache.set(refColor, grayNum);
  return grayNum;
}