/**
 * UI overlays for the piano roll canvas: tooltip and help panel.
 * Kept DOM-only to avoid coupling with Pixi internals.
 */

/** Ensure the parent is positioned for absolute overlay children. */
function ensurePositioned(parent: HTMLElement): void {
  const computedStyle = window.getComputedStyle(parent);
  if (computedStyle.position === "static") {
    parent.style.position = "relative";
  }
}

/**
 * Create and attach the note tooltip overlay to the canvas parent.
 * Returns the created tooltip div.
 */
export function initializeTooltipOverlay(
  canvas: HTMLCanvasElement,
  container?: HTMLElement
): HTMLDivElement {
  const parent = container || canvas.parentElement;
  if (!parent) {
    throw new Error("Tooltip parent element not found");
  }
  ensurePositioned(parent);

  const div = document.createElement("div");
  Object.assign(div.style, {
    position: "absolute",
    zIndex: "1000",
    pointerEvents: "none",
    background: "rgba(0, 0, 0, 0.8)",
    color: "#ffffff",
    padding: "4px 6px",
    borderRadius: "4px",
    fontSize: "12px",
    lineHeight: "1.2",
    whiteSpace: "nowrap",
    display: "none",
  } as CSSStyleDeclaration);

  parent.appendChild(div);
  return div;
}

export interface HelpOverlay {
  button: HTMLButtonElement;
  panel: HTMLDivElement;
}

/** Create and attach a top-right help button with hover panel. */
export function initializeHelpOverlay(
  canvas: HTMLCanvasElement,
  container?: HTMLElement
): HelpOverlay {
  const parent = container || canvas.parentElement;
  if (!parent) {
    throw new Error("Help overlay parent element not found");
  }
  ensurePositioned(parent);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "wr-focusable";
  Object.assign(btn.style, {
    position: "absolute",
    top: "8px",
    right: "8px",
    width: "24px",
    height: "24px",
    lineHeight: "22px",
    border: `1px solid var(--ui-border)`,
    borderRadius: "6px",
    background: "var(--surface)",
    color: "var(--text-muted)",
    fontSize: "14px",
    fontWeight: "700",
    textAlign: "center",
    cursor: "help",
    zIndex: "1200",
  } as CSSStyleDeclaration);
  btn.textContent = "?";
  btn.setAttribute("aria-label", "Piano roll controls help");

  const panel = document.createElement("div");
  panel.setAttribute("role", "tooltip");
  Object.assign(panel.style, {
    position: "absolute",
    top: "36px",
    right: "8px",
    minWidth: "240px",
    maxWidth: "320px",
    background: "var(--surface)",
    border: `1px solid var(--ui-border)`,
    borderRadius: "8px",
    boxShadow: "var(--shadow-md)",
    padding: "10px 12px",
    fontSize: "12px",
    color: "var(--text-primary)",
    display: "none",
    zIndex: "1200",
  } as CSSStyleDeclaration);
  panel.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px;">Piano roll controls</div>
    <ul style="margin:0;padding-left:16px;display:flex;flex-direction:column;gap:4px;">
      <li><strong>Horizontal zoom</strong>: Mouse wheel. Hold Ctrl/Cmd to zoom around cursor.</li>
      <li><strong>Vertical zoom</strong>: Alt/Option + Mouse wheel.</li>
      <li><strong>Pan left/right</strong>: Click & drag horizontally, or Shift + Mouse wheel.</li>
      <li><strong>Pan up/down</strong>: Click & drag vertically (Alt to force vertical-only).</li>
    </ul>
  `;

  let hideTimer: number | null = null;
  const show = () => {
    if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
    panel.style.display = "block";
  };
  const scheduleHide = () => {
    if (hideTimer) window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      panel.style.display = "none";
    }, 200);
  };

  btn.addEventListener("mouseenter", show);
  btn.addEventListener("mouseleave", scheduleHide);
  btn.addEventListener("focus", show);
  btn.addEventListener("blur", scheduleHide);
  panel.addEventListener("mouseenter", show);
  panel.addEventListener("mouseleave", scheduleHide);

  parent.appendChild(btn);
  parent.appendChild(panel);
  return { button: btn, panel };
}


