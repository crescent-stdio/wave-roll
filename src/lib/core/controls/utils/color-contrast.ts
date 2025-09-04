/**
 * Determine whether a HEX color (e.g., "#aabbcc") is perceptually light.
 * Uses WCAG relative luminance computed from sRGB:
 * - Convert sRGB to linear: if C <= 0.03928 then C/12.92, otherwise ((C + 0.055) / 1.055) ^ 2.4
 * - Luminance L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin
 * Consider the color light when L > 0.5.
 */
export function isHexColorLight(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return false;
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const srgb = [r, g, b].map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  const L = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  return L > 0.5;
}
