/**
 * Converts RGB color values to HSV color space
 * @param r Red component (0-255)
 * @param g Green component (0-255)
 * @param b Blue component (0-255)
 * @returns HSV values as [hue, saturation, value]
 */
export function rgbToHsv(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
    }
  }

  const hue = h < 0 ? h * 60 + 360 : h * 60;
  const saturation = max === 0 ? 0 : delta / max;
  const value = max;

  return [hue, saturation, value];
}

/**
 * Converts HSV color values to RGB color space
 * @param h Hue (0-360)
 * @param s Saturation (0-1)
 * @param v Value (0-1)
 * @returns RGB values as [red, green, blue] (0-255)
 */
export function hsvToRgb(
  h: number,
  s: number,
  v: number
): [number, number, number] {
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
  // Base RGB values in 0..255
  const rBase = (r1 + m) * 255;
  const gBase = (g1 + m) * 255;
  const bBase = (b1 + m) * 255;

  // Lighten the color slightly to avoid overly vivid tones.
  const lightenFactor = 0.2; // 0 = original color, 1 = pure white
  const r = Math.round(rBase + (255 - rBase) * lightenFactor);
  const g = Math.round(gBase + (255 - gBase) * lightenFactor);
  const b = Math.round(bBase + (255 - bBase) * lightenFactor);

  return [r, g, b];
}

/**
 * Converts a numeric RGB color (e.g. 0xffaabb) to a 6-character hex string without the leading '#'.
 * This utility centralises the `toString(16).padStart(6, '0')` pattern used across the codebase.
 * @param value Color as a 24-bit integer (0xRRGGBB)
 * @returns Lower-case hex string in the form "#ffaabb"
 */
export function toHexColor(value: number): string {
  return "#" + value.toString(16).padStart(6, "0");
}
