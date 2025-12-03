/**
 * Color calculation and manipulation utilities for piano roll
 */

import type { PianoRoll } from '../piano-roll';
import type { NoteData } from '../types';

export class ColorCalculator {
  /**
   * Get the color for a note
   */
  static getNoteColor(pianoRoll: PianoRoll, note: NoteData, index: number): number {
    if (pianoRoll.options.noteRenderer) {
      return pianoRoll.options.noteRenderer(note, index);
    }
    return pianoRoll.options.noteColor;
  }

  /**
   * Convert hex color string to number
   */
  static hexToNumber(hex: string): number {
    // Remove # if present
    const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;
    return parseInt(cleanHex, 16);
  }

  /**
   * Convert number to hex color string
   */
  static numberToHex(num: number): string {
    return '#' + num.toString(16).padStart(6, '0');
  }

  /**
   * Apply transparency to a color
   */
  static applyTransparency(color: number, alpha: number): number {
    // Ensure alpha is between 0 and 1
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    
    // Extract RGB components
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    
    // Combine with alpha
    const alphaInt = Math.round(clampedAlpha * 255);
    return (alphaInt << 24) | (r << 16) | (g << 8) | b;
  }

  /**
   * Lighten a color by a factor
   */
  static lighten(color: number, factor: number = 0.2): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    
    const newR = Math.min(255, Math.round(r + (255 - r) * factor));
    const newG = Math.min(255, Math.round(g + (255 - g) * factor));
    const newB = Math.min(255, Math.round(b + (255 - b) * factor));
    
    return (newR << 16) | (newG << 8) | newB;
  }

  /**
   * Darken a color by a factor
   */
  static darken(color: number, factor: number = 0.2): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    
    const newR = Math.round(r * (1 - factor));
    const newG = Math.round(g * (1 - factor));
    const newB = Math.round(b * (1 - factor));
    
    return (newR << 16) | (newG << 8) | newB;
  }

  /**
   * Get a contrasting color (for text on background)
   */
  static getContrastColor(backgroundColor: number): number {
    const r = (backgroundColor >> 16) & 0xff;
    const g = (backgroundColor >> 8) & 0xff;
    const b = backgroundColor & 0xff;
    
    // Calculate perceived brightness
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    // Return black or white based on brightness
    return brightness > 128 ? 0x000000 : 0xffffff;
  }

  /**
   * Blend two colors
   */
  static blend(color1: number, color2: number, ratio: number = 0.5): number {
    const r1 = (color1 >> 16) & 0xff;
    const g1 = (color1 >> 8) & 0xff;
    const b1 = color1 & 0xff;
    
    const r2 = (color2 >> 16) & 0xff;
    const g2 = (color2 >> 8) & 0xff;
    const b2 = color2 & 0xff;
    
    const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
    const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
    const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
    
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Convert RGB color (hex number) to HSL
   * @returns Object with h (0-360), s (0-1), l (0-1)
   */
  static rgbToHsl(color: number): { h: number; s: number; l: number } {
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
      // Achromatic (gray)
      return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h = 0;
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }

    return { h: h * 360, s, l };
  }

  /**
   * Convert HSL to RGB color (hex number)
   * @param h Hue (0-360)
   * @param s Saturation (0-1)
   * @param l Lightness (0-1)
   */
  static hslToRgb(h: number, s: number, l: number): number {
    const hNorm = h / 360;

    if (s === 0) {
      // Achromatic (gray)
      const gray = Math.round(l * 255);
      return (gray << 16) | (gray << 8) | gray;
    }

    const hue2rgb = (p: number, q: number, t: number): number => {
      let tNorm = t;
      if (tNorm < 0) tNorm += 1;
      if (tNorm > 1) tNorm -= 1;
      if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
      if (tNorm < 1 / 2) return q;
      if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    const r = Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255);
    const g = Math.round(hue2rgb(p, q, hNorm) * 255);
    const b = Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255);

    return (r << 16) | (g << 8) | b;
  }

  /**
   * Get a lightness-variant color for a track within a file.
   * Uses HSL color space to adjust lightness while preserving hue,
   * ensuring file-level color identity is maintained.
   *
   * @param baseColor - The file's base color (hex number)
   * @param trackIndex - Index of the track within the file (0-based)
   * @param totalTracks - Total number of tracks in the file
   * @returns Adjusted color with modified lightness
   */
  static getTrackVariantColor(
    baseColor: number,
    trackIndex: number,
    totalTracks: number
  ): number {
    // No variation needed for single track or first track
    if (totalTracks <= 1 || trackIndex === 0) return baseColor;

    const { h, s, l } = ColorCalculator.rgbToHsl(baseColor);

    // Alternating pattern: track 1 → lighter, track 2 → darker, track 3 → lighter+, ...
    const step = Math.floor((trackIndex + 1) / 2);
    const shift = step * 0.20; // 20% lightness shift per step
    const isLighten = trackIndex % 2 === 1;

    // Clamp lightness to avoid too dark (< 0.20) or too bright (> 0.90)
    const newL = isLighten
      ? Math.min(0.90, l + shift)
      : Math.max(0.20, l - shift);

    return ColorCalculator.hslToRgb(h, s, newL);
  }
}