/** Replace preview-safe color with CSS currentColor for runtime use */
export function toCurrentColor(svg: string): string {
  return svg.split("#000").join("currentColor").trim();
}
