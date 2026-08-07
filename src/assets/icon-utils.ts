/** Replace preview-safe color with CSS currentColor for runtime use */
export function toCurrentColor(svg: string): string {
  return svg.split("#000").join("currentColor").trim();
}

/** Rendered size in CSS pixels that every icon is normalized to */
export const ICON_SIZE = 20;

/** Normalize width/height to ICON_SIZE so all icons render at a consistent size */
export function normalizeSize(svg: string): string {
  return svg
    .replace(/\swidth="[^"]*"/, ` width="${ICON_SIZE}"`)
    .replace(/\sheight="[^"]*"/, ` height="${ICON_SIZE}"`);
}

/** Target stroke weight in rendered CSS pixels */
export const ICON_STROKE_PX = 1.5;

/**
 * Normalize stroke-width so every icon renders at ICON_STROKE_PX.
 *
 * stroke-width is measured in viewBox user units, not pixels, so a single
 * hardcoded value renders thinner on icons drawn in a larger viewBox. Deriving
 * it from each icon's own viewBox keeps the apparent weight constant:
 * a 24 viewBox yields 1.8 and a 32 viewBox yields 2.4, both 1.5px at ICON_SIZE.
 */
export function normalizeStroke(svg: string): string {
  const viewBox = svg.match(/viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)/);
  const authoredSize = viewBox ? Number(viewBox[1]) : NaN;
  // Icons without a usable viewBox are already in ICON_SIZE units
  const size = authoredSize > 0 ? authoredSize : ICON_SIZE;
  const strokeWidth = Math.round(((ICON_STROKE_PX * size) / ICON_SIZE) * 100) / 100;

  return svg.replace(/stroke-width="[^"]*"/g, `stroke-width="${strokeWidth}"`);
}

/** Prepare raw SVG for runtime: normalize size, stroke + apply currentColor */
export function prepareSvg(svg: string): string {
  return toCurrentColor(normalizeStroke(normalizeSize(svg)));
}
