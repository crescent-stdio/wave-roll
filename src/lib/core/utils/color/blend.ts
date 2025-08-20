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

/**
 * Perceptually mix two RGB colors in OKLCH space for better readability
 * and color-vision deficiency resilience.
 *
 * The interpolation is performed in OKLCH with shortest-arc hue interpolation,
 * which generally yields smoother hue transitions than RGB/HSV mixing.
 *
 * @param a First color as 0xRRGGBB
 * @param b Second color as 0xRRGGBB
 * @param ratio Blend ratio in [0,1]; 0 => a, 1 => b
 * @returns Mixed color as 0xRRGGBB
 */
export function mixColorsOklch(a: number, b: number, ratio = 0.5): number {
  const r = clamp01(ratio);
  const aRgb = intToRgb(a);
  const bRgb = intToRgb(b);

  const aOk = rgbToOklab(aRgb[0], aRgb[1], aRgb[2]);
  const bOk = rgbToOklab(bRgb[0], bRgb[1], bRgb[2]);

  const aLch = oklabToLch(aOk.L, aOk.a, aOk.b);
  const bLch = oklabToLch(bOk.L, bOk.a, bOk.b);

  // Linear interpolate Lightness and Chroma; circular interpolate Hue
  const L = aLch.L * (1 - r) + bLch.L * r;
  const C = aLch.C * (1 - r) + bLch.C * r;
  const h = interpolateAngleShortest(aLch.h, bLch.h, r);

  const { L: oL, a: oA, b: oB } = lchToOklab(L, C, h);
  const rgb = oklabToRgb(oL, oA, oB);
  return rgbToInt(rgb[0], rgb[1], rgb[2]);
}

// ------------------------------
// Helpers (private)
// ------------------------------

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function intToRgb(value: number): [number, number, number] {
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return [r, g, b];
}

function rgbToInt(r: number, g: number, b: number): number {
  const rr = Math.max(0, Math.min(255, Math.round(r)));
  const gg = Math.max(0, Math.min(255, Math.round(g)));
  const bb = Math.max(0, Math.min(255, Math.round(b)));
  return (rr << 16) | (gg << 8) | bb;
}

function srgbToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(1, v)) * 255;
}

function rgbToOklab(r: number, g: number, b: number): { L: number; a: number; b: number } {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);

  const l = 0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B;
  const m = 0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B;
  const s = 0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}

function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const B = 0.0044210633 * l - 0.7034186147 * m + 1.7035977687 * s;

  return [linearToSrgb(R), linearToSrgb(G), linearToSrgb(B)];
}

function oklabToLch(L: number, a: number, b: number): { L: number; C: number; h: number } {
  const C = Math.sqrt(a * a + b * b);
  let h = Math.atan2(b, a) * (180 / Math.PI);
  if (h < 0) h += 360;
  return { L, C, h };
}

function lchToOklab(L: number, C: number, h: number): { L: number; a: number; b: number } {
  const rad = (h % 360) * (Math.PI / 180);
  const a = Math.cos(rad) * C;
  const b = Math.sin(rad) * C;
  return { L, a, b };
}

function interpolateAngleShortest(a: number, b: number, t: number): number {
  let delta = ((b - a + 540) % 360) - 180; // range [-180, 180)
  return (a + delta * t + 360) % 360;
}
