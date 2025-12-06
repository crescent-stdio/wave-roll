import type { OnsetMarkerStyle, OnsetMarkerShape } from "@/types";

/**
 * Build an inline SVG string for an onset marker.
 * The shape geometry is consistent across UI call sites.
 *
 * Design System:
 * - Base Grid: 24x24 viewBox
 * - All coordinates are relative to this 24x24 grid
 * - The 'size' parameter controls the rendered size (width/height attributes)
 */
export function renderOnsetSVG(
  style: OnsetMarkerStyle,
  colorHex: string,
  size: number = 16
): string {
  const stroke = colorHex;
  const fill = style.variant === "filled" ? colorHex : "transparent";

  // Scale stroke width based on size relative to base grid (24)
  // If size is 16, we want visually similar weight to 24px icons
  // Standard stroke for 24px icons is 2.
  const baseStroke = style.strokeWidth || 2;
  // Normalize stroke width so it looks consistent regardless of render size
  // If we render at 16px, a stroke of 2 in 24px coord system becomes 2 * (16/24) = 1.33px visual
  // We want visual stroke of ~1.5-2px usually.
  const sw = Math.max(1, baseStroke);

  // Base grid coordinates
  const w = 24;
  const h = 24;
  const cx = 12;
  const cy = 12;
  const r = 9; // Radius for shapes within 24x24 box (allows padding for stroke)

  const poly = (pts: Array<[number, number]>) =>
    `M ${pts.map(([x, y], i) => `${i === 0 ? "" : "L "}${x} ${y}`).join(" ")} Z`;

  const pathFor = (shape: OnsetMarkerShape): string => {
    switch (shape) {
      case "circle":
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case "square": {
        const d = r / Math.SQRT2; // Make square fit within the circle radius area approx
        // Or just use full size? Let's use approx 16x16 square in 24x24
        const s = 16;
        const o = (24 - s) / 2;
        return `<rect x="${o}" y="${o}" width="${s}" height="${s}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "diamond":
        return `<path d="${poly([
          [cx, cy - r],
          [cx + r, cy],
          [cx, cy + r],
          [cx - r, cy],
        ])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      case "triangle-up":
        return `<path d="${poly([
          [cx, cy - r],
          [cx + r * 0.866, cy + r * 0.5],
          [cx - r * 0.866, cy + r * 0.5],
        ])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      case "triangle-down":
        return `<path d="${poly([
          [cx - r * 0.866, cy - r * 0.5],
          [cx + r * 0.866, cy - r * 0.5],
          [cx, cy + r],
        ])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      case "triangle-left":
        return `<path d="${poly([
          [cx + r * 0.5, cy - r * 0.866],
          [cx + r * 0.5, cy + r * 0.866],
          [cx - r, cy],
        ])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      case "triangle-right":
        return `<path d="${poly([
          [cx - r * 0.5, cy - r * 0.866],
          [cx - r * 0.5, cy + r * 0.866],
          [cx + r, cy],
        ])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      case "star": {
        const pts: Array<[number, number]> = [];
        const spikes = 5;
        const outer = r;
        const inner = r * 0.4;
        for (let i = 0; i < spikes * 2; i++) {
          const ang = (i * Math.PI) / spikes - Math.PI / 2;
          const rad = i % 2 === 0 ? outer : inner;
          pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
        }
        return `<path d="${poly(pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      }
      case "cross": // X shape
        return `<path d="M7 7l10 10M17 7l-10 10" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
      case "plus":
        return `<path d="M12 5v14M5 12h14" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;
      case "hexagon": {
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i; // Flat top? or Pointy top? Lucide polygon usually pointy up?
          // Let's do flat sides (pointy top) to match circle
          const ang = a - Math.PI / 6;
          pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
        }
        return `<path d="${poly(pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      }
      case "pentagon": {
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < 5; i++) {
          const a = ((2 * Math.PI) / 5) * i - Math.PI / 2;
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        return `<path d="${poly(pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
      }
      case "chevron-up":
        return `<path d="M6 15l6-6 6 6" stroke="${stroke}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      case "chevron-down":
        return `<path d="M6 9l6 6 6-6" stroke="${stroke}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      default: {
        const s = 16;
        const o = (24 - s) / 2;
        return `<rect x="${o}" y="${o}" width="${s}" height="${s}" rx="2" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
    }
  };

  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="pointer-events: none;">${pathFor(
    style.shape
  )}</svg>`;
}
