/**
 * Loop marker (A/B) factory shared between the seek-bar and the standalone
 * time-display components. Injects the common CSS only once and returns a
 * styled <div> element that contains the label plus its vertical stem.
 *
 * The stem height can be customised on a per-marker basis via the
 * `stemHeight` parameter. This is implemented with a CSS custom property so we
 * avoid generating separate selector rules for each marker instance.
 */

export interface MarkerOptions {
  id: string;
  label: string;
  color: string;
  /** Height (in px) of the vertical stem that reaches down into the bar. */
  stemHeight?: number;
}

const GLOBAL_MARKER_CSS_ID = "wr-marker-css";

/**
 * Ensure the global .wr-marker stylesheet is present in the document head.
 */
function ensureGlobalMarkerCss(): void {
  if (document.getElementById(GLOBAL_MARKER_CSS_ID)) return;

  const style = document.createElement("style");
  style.id = GLOBAL_MARKER_CSS_ID;
  style.textContent = `
    .wr-marker {
      position: absolute;
      top: -24px;
      transform: translateX(-50%);
      font-family: monospace;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 4px;
      border-radius: 4px 4px 0 0;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 3;
      width: auto;
      min-width: 16px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Create a loop marker element (label + coloured background + vertical stem).
 *
 * The returned element is hidden (`display:none`) by default - callers should
 * toggle it to `block` once the corresponding loop point is set.
 */
export function createMarker(
  label: string,
  color: string,
  id: string,
  stemHeight = 30
): HTMLElement {
  ensureGlobalMarkerCss();

  const el = document.createElement("div");
  el.id = id;
  el.className = "wr-marker";

  /* ----- Fallback inline styles --------------------------------------- */
  // These guarantee correct rendering even if the global stylesheet is
  // stripped out (e.g. through aggressive tree-shaking or CSP restrictions).
  el.style.position = "absolute";
  el.style.top = "-24px";
  el.style.left = "0";
  el.style.transform = "translateX(-50%)";
  el.style.fontFamily = "monospace";
  el.style.fontSize = "11px";
  el.style.fontWeight = "600";
  el.style.padding = "2px 4px";
  el.style.borderRadius = "4px 4px 0 0";
  el.style.pointerEvents = "none";
  el.style.zIndex = "3";
  el.style.width = "auto";
  el.style.minWidth = "16px";
  el.style.maxWidth = "30px";
  el.style.textAlign = "center";
  el.style.boxSizing = "border-box";

  /* ----- Dynamic styling --------------------------------------------- */
  el.style.background = color; // Label background

  // Choose text color based on background luminance for AA contrast
  const textColor = (() => {
    const hex = color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const srgb = [r, g, b].map((v) =>
      v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    );
    const L = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    // If background is bright, use black text; else white.
    return L > 0.5 ? "#000000" : "#ffffff";
  })();

  // Hidden until loop point is assigned
  el.style.display = "none";

  const span = document.createElement("span");
  span.textContent = label;
  span.style.color = textColor;
  span.style.display = "block";
  el.appendChild(span);

  // Add stem as a real DOM element instead of pseudo-element
  const stem = document.createElement("div");
  stem.className = "wr-marker-stem";
  stem.style.cssText = `
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    height: ${stemHeight}px;
    background: ${color};
    pointer-events: none;
  `;
  el.appendChild(stem);

  return el;
}
