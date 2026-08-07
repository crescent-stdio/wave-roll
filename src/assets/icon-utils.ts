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

/** Normalize stroke-width to 1.5 for consistent icon weight */
export function normalizeStroke(svg: string): string {
  return svg.replace(/stroke-width="[^"]*"/g, 'stroke-width="1.8"');
}

/** Prepare raw SVG for runtime: normalize size, stroke + apply currentColor */
export function prepareSvg(svg: string): string {
  return toCurrentColor(normalizeStroke(normalizeSize(svg)));
}
