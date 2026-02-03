/**
 * DOM-based tooltip manager for Shadow DOM compatibility.
 * Native title attributes don't work reliably in Shadow DOM,
 * so this provides a custom tooltip solution.
 */

export interface TooltipManager {
  show: (text: string, anchor: HTMLElement) => void;
  hide: () => void;
  destroy: () => void;
}

export interface TooltipOptions {
  /** Position relative to anchor: "top" | "bottom" (default: "top") */
  position?: "top" | "bottom";
  /** Auto-hide duration in ms (0 = no auto-hide, default: 2000) */
  duration?: number;
  /** Z-index for the tooltip (default: 1000) */
  zIndex?: number;
}

/**
 * Create a tooltip manager for a container element.
 * The tooltip element is appended to the container and positioned
 * relative to anchor elements when shown.
 */
export function createTooltipManager(
  container: HTMLElement,
  options: TooltipOptions = {},
): TooltipManager {
  const { position = "top", duration = 2000, zIndex = 1000 } = options;

  const tip = document.createElement("div");
  tip.style.cssText = `
    position: absolute;
    z-index: ${zIndex};
    padding: 4px 8px;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    font-size: 11px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease-in-out;
  `;
  container.appendChild(tip);

  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function clearHideTimer(): void {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function show(text: string, anchor: HTMLElement): void {
    clearHideTimer();

    tip.textContent = text;
    tip.style.opacity = "1";

    // Position relative to anchor
    const anchorRect = anchor.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const left = anchorRect.left - containerRect.left + anchorRect.width / 2;

    if (position === "top") {
      tip.style.bottom = `${containerRect.height - (anchorRect.top - containerRect.top) + 4}px`;
      tip.style.top = "";
    } else {
      tip.style.top = `${anchorRect.bottom - containerRect.top + 4}px`;
      tip.style.bottom = "";
    }

    // Defer left calculation to after render for accurate width
    requestAnimationFrame(() => {
      const tipWidth = tip.offsetWidth;
      tip.style.left = `${left - tipWidth / 2}px`;
    });

    if (duration > 0) {
      hideTimer = setTimeout(() => {
        tip.style.opacity = "0";
        hideTimer = null;
      }, duration);
    }
  }

  function hide(): void {
    clearHideTimer();
    tip.style.opacity = "0";
  }

  function destroy(): void {
    clearHideTimer();
    tip.remove();
  }

  return { show, hide, destroy };
}
