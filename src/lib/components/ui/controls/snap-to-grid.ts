import { UIComponentDependencies } from "../types";
import { createIconButton } from "../utils/icon-button";
import { attachHoverBackground } from "@/core/controls/utils/hover-background";
import { COLOR_PRIMARY } from "@/lib/core/constants/index";

/**
 * SVG icon: vertical grid lines with a dot snapping to center
 * Represents aligning notes to the beat grid.
 */
const SNAP_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
  <line x1="4" y1="2" x2="4" y2="14"/>
  <line x1="12" y1="2" x2="12" y2="14"/>
  <circle cx="8" cy="8" r="2" fill="currentColor"/>
  <path d="M6 8h-2M10 8h2"/>
</svg>`;

/**
 * Create a snap to grid toggle button for the main control bar.
 *
 * When enabled, note onsets are visually aligned to the nearest beat.
 * Only active when grid mode is "beats" (disabled in "seconds" mode).
 */
export function createSnapToGridControl(deps: UIComponentDependencies): HTMLElement {
  const { stateManager, pianoRoll } = deps;

  const getTooltip = (enabled: boolean): string => {
    const gridMode = pianoRoll?.getGridMode?.() ?? "seconds";
    if (gridMode === "seconds") {
      return "Snap to Grid: Enable Beats mode first";
    }

    if (enabled) {
      return "Snap to Grid: On - Notes aligned to nearest beat";
    }
    return "Snap to Grid: Off - Original note timing";
  };

  const isBeatsMode = (): boolean => {
    return pianoRoll?.getGridMode?.() === "beats";
  };

  const updateVisual = (active: boolean) => {
    const beatsMode = isBeatsMode();
    btn.title = getTooltip(active);

    if (!beatsMode) {
      // Disabled state in seconds mode
      btn.dataset.active = "";
      btn.style.background = "transparent";
      btn.style.color = "var(--text-disabled, #666)";
      btn.style.opacity = "0.5";
      btn.style.cursor = "not-allowed";
    } else if (active) {
      btn.dataset.active = "true";
      btn.style.background = "rgba(0, 123, 255, 0.1)";
      btn.style.color = COLOR_PRIMARY;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    } else {
      delete btn.dataset.active;
      btn.style.background = "transparent";
      btn.style.color = "var(--text-muted)";
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
    }
  };

  const initialEnabled = stateManager.getState().visual.snapToGridEnabled;

  const btn = createIconButton(
    SNAP_ICON,
    () => {
      // Only toggle if in beats mode
      if (!isBeatsMode()) return;

      const current = stateManager.getState().visual.snapToGridEnabled;
      stateManager.updateVisualState({ snapToGridEnabled: !current });
      updateVisual(!current);
    },
    getTooltip(initialEnabled),
  );

  btn.setAttribute("aria-label", "Toggle snap to grid");
  attachHoverBackground(btn);
  updateVisual(initialEnabled);

  // Note: No listener for grid mode changes (lazy check pattern)
  // Visual state updates on next click when grid mode changes

  return btn;
}
