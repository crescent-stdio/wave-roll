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
}