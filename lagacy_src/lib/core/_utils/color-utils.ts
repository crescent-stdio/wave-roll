import { NoteData } from "src/lib/types";

// Color constants for MIDI visualization
export const COLOR_PRIMARY = "#0984e3"; // Vibrant blue
export const COLOR_A = "#00b894"; // Teal
export const COLOR_B = "#e74c3c"; // Vibrant red-orange
export const COLOR_OVERLAP = "#9b59b6"; // Purple for overlapping notes

/**
 * Detects overlapping notes between different MIDI files
 * @param notes Array of note objects with color and file ID information
 * @returns Map where the key is the note index and the value is the overlapping time range { start, end }
 */
export function detectOverlappingNotes(
  notes: Array<{ note: NoteData; color: number; fileId: string }>
): Map<number, Array<{ start: number; end: number }>> {
  const overlappingRanges = new Map<
    number,
    Array<{ start: number; end: number }>
  >();

  // Iterate over all note pairs to find overlaps
  for (let i = 0; i < notes.length; i++) {
    const noteA = notes[i].note;
    for (let j = i + 1; j < notes.length; j++) {
      const noteB = notes[j].note;

      // Only compare notes that come from different files and share the same pitch
      if (notes[i].fileId === notes[j].fileId || noteA.midi !== noteB.midi) {
        continue;
      }

      // Calculate overlap interval
      const overlapStart = Math.max(noteA.time, noteB.time);
      const overlapEnd = Math.min(
        noteA.time + noteA.duration,
        noteB.time + noteB.duration
      );

      if (overlapEnd <= overlapStart) {
        continue; // No actual overlap
      }

      // Push range helper
      const addRange = (idx: number, start: number, end: number): void => {
        const ranges = overlappingRanges.get(idx) ?? [];
        ranges.push({ start, end });
        overlappingRanges.set(idx, ranges);
      };

      addRange(i, overlapStart, overlapEnd);
      addRange(j, overlapStart, overlapEnd);
    }
  }

  // Merge overlapping ranges for each note, but keep distinct adjoining ranges
  // separate so that we end up with disjoint intervals as required.
  overlappingRanges.forEach((ranges, idx) => {
    if (ranges.length <= 1) return;

    // Sort by start time
    ranges.sort((a, b) => a.start - b.start);

    const merged: Array<{ start: number; end: number }> = [];
    let current = { ...ranges[0] };

    for (let k = 1; k < ranges.length; k++) {
      const r = ranges[k];
      if (r.start < current.end) {
        // Ranges overlap by a positive amount → extend
        current.end = Math.max(current.end, r.end);
      } else {
        // Touching (r.start === current.end) or separated → keep separate
        merged.push(current);
        current = { ...r };
      }
    }
    merged.push(current);

    overlappingRanges.set(idx, merged);
  });

  return overlappingRanges;
}

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

  // Lighten the colour slightly to avoid overly vivid tones.
  const lightenFactor = 0.2; // 0 = original colour, 1 = pure white
  const r = Math.round(rBase + (255 - rBase) * lightenFactor);
  const g = Math.round(gBase + (255 - gBase) * lightenFactor);
  const b = Math.round(bBase + (255 - bBase) * lightenFactor);

  return [r, g, b];
}

/**
 * Blend multiple RGB colors using an unweighted average in HSV space.
 * This approach preserves hue relationships better than direct RGB averaging,
 * producing more visually pleasing results when many colours overlap.
 * @param colors Array of colours as 0xRRGGBB numbers
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
