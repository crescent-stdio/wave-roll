import type { OnsetMarkerStyle, OnsetMarkerShape } from "@/types";

/**
 * Build an inline SVG string for an onset marker.
 * The shape geometry is consistent across UI call sites.
 */
export function renderOnsetSVG(
  style: OnsetMarkerStyle,
  colorHex: string,
  size: number = 16
): string {
  const stroke = colorHex;
  const fill = style.variant === "filled" ? colorHex : "transparent";
  const sw = Math.max(1, style.strokeWidth || 2);
  const w = size;
  const h = size;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;

  const poly = (pts: Array<[number, number]>) =>
    `M ${pts.map(([x, y], i) => `${i === 0 ? "" : "L "}${x} ${y}`).join(" ")} Z`;

  const pathFor = (shape: OnsetMarkerShape): string => {
    switch (shape) {
      case "circle":
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case "square": {
        const d = r / Math.SQRT2;
        return `<rect x="${cx - d}" y="${cy - d}" width="${2 * d}" height="${2 * d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "diamond":
        return `<path d="${poly([[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case "triangle-up":
        return `<path d="${poly([[cx, cy - r], [cx + r * 0.866, cy + r * 0.5], [cx - r * 0.866, cy + r * 0.5]])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case "triangle-down":
        return `<path d="${poly([[cx - r * 0.866, cy - r * 0.5], [cx + r * 0.866, cy - r * 0.5], [cx, cy + r]])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case "triangle-left":
        return `<path d="${poly([[cx + r, cy - r * 0.5 * 0.866], [cx + r, cy + r * 0.5 * 0.866], [cx - r, cy]])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case "triangle-right":
        return `<path d="${poly([[cx - r, cy - r * 0.5 * 0.866], [cx - r, cy + r * 0.5 * 0.866], [cx + r, cy]])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case "star": {
        const pts: Array<[number, number]> = [];
        const spikes = 5;
        const outer = r;
        const inner = r * 0.45;
        for (let i = 0; i < spikes * 2; i++) {
          const ang = (i * Math.PI) / spikes - Math.PI / 2;
          const rad = i % 2 === 0 ? outer : inner;
          pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]);
        }
        return `<path d="${poly(pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "cross":
        return `<g stroke="${stroke}" stroke-width="${sw}"><line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}"/><line x1="${cx + r}" y1="${cy - r}" x2="${cx - r}" y2="${cy + r}"/></g>`;
      case "plus":
        return `<g stroke="${stroke}" stroke-width="${sw}"><line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}"/><line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}"/></g>`;
      case "hexagon": {
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + Math.PI / 6;
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        return `<path d="${poly(pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "pentagon": {
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < 5; i++) {
          const a = ((2 * Math.PI) / 5) * i - Math.PI / 2;
          pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        return `<path d="${poly(pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
      case "chevron-up":
        return `<path d="${poly([[cx - r, cy + r * 0.4], [cx, cy - r * 0.6], [cx + r, cy + r * 0.4]])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      case "chevron-down":
        return `<path d="${poly([[cx - r, cy - r * 0.4], [cx, cy + r * 0.6], [cx + r, cy - r * 0.4]])}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      default: {
        const d = r / Math.SQRT2;
        return `<rect x="${cx - d}" y="${cy - d}" width="${2 * d}" height="${2 * d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
      }
    }
  };

  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${pathFor(style.shape)}</svg>`;
}


