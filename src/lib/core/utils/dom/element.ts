/**
 * Create a DOM element, apply inline styles, and set optional textContent.
 *
 * @param tag - The tag name of the element.
 * @param styles - The inline styles to apply to the element.
 * @param text - The text content to set on the element.
 * @returns The created element.
 */
export function createElement(
  tag: string,
  styles: string,
  text?: string
): HTMLElement {
  const el = document.createElement(tag);
  el.style.cssText = styles;
  if (text) el.textContent = text;
  return el;
}
