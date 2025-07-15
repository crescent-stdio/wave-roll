import { rgbToHsv, hsvToRgb } from "./format";

/**
 * Blend multiple RGB colors using an unweighted average in HSV space.
 * This approach preserves hue relationships better than direct RGB averaging,
 * producing more visually pleasing results when many colors overlap.
 * @param colors Array of colors as 0xRRGGBB numbers
 * @param _weights Ignored - kept for backwards-compatibility
 * @returns Blended color as 0xRRGGBB number
 */
export function blendColorsAverage(
  colors: number[],
  _weights: number[] = []
): number {
  if (colors.length === 0) {
    return 0xffffff;
  }

  let sumX = 0;
  let sumY = 0;
  let sumS = 0;
  let sumV = 0;

  for (const c of colors) {
    const r = (c >> 16) & 0xff;
    const g = (c >> 8) & 0xff;
    const b = c & 0xff;

    const [h, s, v] = rgbToHsv(r, g, b);
    const rad = (h * Math.PI) / 180;
    sumX += Math.cos(rad);
    sumY += Math.sin(rad);
    sumS += s;
    sumV += v;
  }

  const n = colors.length;
  const avgH = Math.atan2(sumY / n, sumX / n);
  const hueDeg = (avgH * 180) / Math.PI + (avgH < 0 ? 360 : 0);
  const sat = Math.min(1, Math.max(0, sumS / n));
  const val = Math.min(1, Math.max(0, sumV / n));

  const [r, g, b] = hsvToRgb(hueDeg, sat, val);
  return (r << 16) | (g << 8) | b;
}
