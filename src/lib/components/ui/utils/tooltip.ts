/**
 * DOM-based tooltip manager for Shadow DOM compatibility.
 * Native title attributes don't work reliably in Shadow DOM,
 * so this provides a custom tooltip solution.
 *
 * Features:
 * - Singleton pattern: One shared tooltip element for all controls
 * - Accessibility: role="tooltip", aria-describedby support, focus events
 * - Hover delay: 300ms delay before showing to prevent accidental triggers
 * - Viewport boundary handling: Prevents tooltip from being clipped at edges
 */

let globalTooltip: HTMLDivElement | null = null;
let tooltipIdCounter = 0;

export interface TooltipOptions {
  /** Position relative to anchor: "top" | "bottom" (default: "top") */
  position?: "top" | "bottom";
  /** Auto-hide duration in ms (0 = no auto-hide, default: 2000) */
  duration?: number;
  /** Z-index for the tooltip (default: 10000) */
  zIndex?: number;
  /** Delay before showing tooltip in ms (default: 300) */
  showDelay?: number;
}

interface TooltipState {
  showTimer: ReturnType<typeof setTimeout> | null;
  hideTimer: ReturnType<typeof setTimeout> | null;
  currentAnchor: HTMLElement | null;
}

const state: TooltipState = {
  showTimer: null,
  hideTimer: null,
  currentAnchor: null,
};

/**
 * Get or create the singleton tooltip element.
 * Appended to document.body for reliable positioning outside Shadow DOM.
 */
function getGlobalTooltip(zIndex: number): HTMLDivElement {
  if (globalTooltip) {
    return globalTooltip;
  }

  const tip = document.createElement("div");
  tip.id = `wave-roll-tooltip-${++tooltipIdCounter}`;
  tip.setAttribute("role", "tooltip");
  tip.style.cssText = `
    position: fixed;
    z-index: ${zIndex};
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    font-size: 12px;
    font-weight: 500;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.15s ease-in-out, visibility 0.15s ease-in-out;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  `;
  document.body.appendChild(tip);
  globalTooltip = tip;
  return tip;
}

function clearTimers(): void {
  if (state.showTimer) {
    clearTimeout(state.showTimer);
    state.showTimer = null;
  }
  if (state.hideTimer) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }
}

function positionTooltip(
  tip: HTMLDivElement,
  anchor: HTMLElement,
  position: "top" | "bottom",
): void {
  const rect = anchor.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  const tipWidth = tipRect.width || 100; // Estimate if not rendered yet
  const tipHeight = tipRect.height || 30;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const padding = 8; // Minimum padding from viewport edges

  // Calculate horizontal position (centered on anchor)
  let left = rect.left + rect.width / 2 - tipWidth / 2;

  // Viewport boundary checks (horizontal)
  if (left < padding) {
    left = padding;
  } else if (left + tipWidth > viewportWidth - padding) {
    left = viewportWidth - tipWidth - padding;
  }

  // Calculate vertical position
  let top: number;
  let actualPosition = position;

  if (position === "top") {
    top = rect.top - tipHeight - 6;
    // If not enough space at top, flip to bottom
    if (top < padding) {
      top = rect.bottom + 6;
      actualPosition = "bottom";
    }
  } else {
    top = rect.bottom + 6;
    // If not enough space at bottom, flip to top
    if (top + tipHeight > viewportHeight - padding) {
      top = rect.top - tipHeight - 6;
      actualPosition = "top";
    }
  }

  // Final boundary check for vertical
  if (top < padding) {
    top = padding;
  } else if (top + tipHeight > viewportHeight - padding) {
    top = viewportHeight - tipHeight - padding;
  }

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  tip.style.transform = "none"; // Use direct positioning
}

function showTooltip(text: string, anchor: HTMLElement, options: TooltipOptions): void {
  clearTimers();

  const { position = "top", duration = 2000, zIndex = 10000, showDelay = 300 } = options;
  const tip = getGlobalTooltip(zIndex);

  state.showTimer = setTimeout(() => {
    state.showTimer = null;
    state.currentAnchor = anchor;

    tip.textContent = text;
    tip.style.opacity = "1";
    tip.style.visibility = "visible";

    // Set aria-describedby on anchor for accessibility
    anchor.setAttribute("aria-describedby", tip.id);

    // Position after making visible (so we can measure)
    requestAnimationFrame(() => {
      positionTooltip(tip, anchor, position);
    });

    // Auto-hide if duration is set
    if (duration > 0) {
      state.hideTimer = setTimeout(() => {
        hideTooltip();
      }, duration);
    }
  }, showDelay);
}

function hideTooltip(): void {
  clearTimers();

  if (globalTooltip) {
    globalTooltip.style.opacity = "0";
    globalTooltip.style.visibility = "hidden";
  }

  // Remove aria-describedby from previous anchor
  if (state.currentAnchor) {
    state.currentAnchor.removeAttribute("aria-describedby");
    state.currentAnchor = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy API: TooltipManager (for backward compatibility with snap-to-grid.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface TooltipManager {
  show: (text: string, anchor: HTMLElement) => void;
  hide: () => void;
  destroy: () => void;
}

/**
 * Create a tooltip manager for a container element.
 * Now uses the singleton tooltip internally.
 *
 * @deprecated Use attachTooltip() for new code
 */
export function createTooltipManager(
  _container: HTMLElement,
  options: TooltipOptions = {},
): TooltipManager {
  const opts = { ...options };

  return {
    show: (text: string, anchor: HTMLElement) => {
      showTooltip(text, anchor, { ...opts, showDelay: 0 }); // No delay for programmatic show
    },
    hide: () => {
      hideTooltip();
    },
    destroy: () => {
      // Singleton is not destroyed per-manager
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// New API: attachTooltip() - Simple declarative tooltip attachment
// ─────────────────────────────────────────────────────────────────────────────

export interface AttachTooltipOptions extends TooltipOptions {
  /** Function to get tooltip text dynamically (called on show) */
  getText?: () => string;
}

/**
 * Attach tooltip behavior to an element.
 * Handles mouseenter, mouseleave, focus, and blur events.
 *
 * @param anchor - The element to attach tooltip to
 * @param textOrOptions - Static tooltip text, or options with getText function
 * @param options - Additional options (if first param is string)
 * @returns Cleanup function to remove event listeners
 */
export function attachTooltip(
  anchor: HTMLElement,
  textOrOptions: string | AttachTooltipOptions,
  options: TooltipOptions = {},
): () => void {
  let getText: () => string;
  let opts: TooltipOptions;

  if (typeof textOrOptions === "string") {
    getText = () => textOrOptions;
    opts = options;
  } else {
    getText = textOrOptions.getText ?? (() => "");
    opts = textOrOptions;
  }

  const handleShow = () => {
    const text = getText();
    if (text) {
      showTooltip(text, anchor, opts);
    }
  };

  const handleHide = () => {
    hideTooltip();
  };

  // Mouse events
  anchor.addEventListener("mouseenter", handleShow);
  anchor.addEventListener("mouseleave", handleHide);

  // Focus events for keyboard accessibility
  anchor.addEventListener("focus", handleShow);
  anchor.addEventListener("blur", handleHide);

  // Return cleanup function
  return () => {
    anchor.removeEventListener("mouseenter", handleShow);
    anchor.removeEventListener("mouseleave", handleHide);
    anchor.removeEventListener("focus", handleShow);
    anchor.removeEventListener("blur", handleHide);
    hideTooltip();
  };
}

/**
 * Destroy the global tooltip element.
 * Call this when unmounting the entire application.
 */
export function destroyGlobalTooltip(): void {
  clearTimers();
  if (globalTooltip) {
    globalTooltip.remove();
    globalTooltip = null;
  }
  state.currentAnchor = null;
}
