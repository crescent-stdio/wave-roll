import { UIComponentDependencies } from "../types";
import { createIconButton } from "../utils/icon-button";
import { attachHoverBackground } from "@/core/controls/utils/hover-background";
import { COLOR_PRIMARY } from "@/lib/core/constants/index";

/** SVG icon: a simplified grid/music-note icon for beat mode */
const GRID_BEAT_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
  <line x1="3" y1="2" x2="3" y2="14"/>
  <line x1="8" y1="2" x2="8" y2="14"/>
  <line x1="13" y1="2" x2="13" y2="14"/>
  <line x1="5.5" y1="6" x2="5.5" y2="14" opacity="0.4"/>
  <line x1="10.5" y1="6" x2="10.5" y2="14" opacity="0.4"/>
</svg>`;

/**
 * Create a grid mode toggle button for the main control bar.
 *
 * Toggles between 'seconds' (default) and 'beats' grid display mode.
 * Visual state follows the repeat-toggle pattern (active = blue tint).
 */
export function createGridModeControl(deps: UIComponentDependencies): HTMLElement {
  const updateVisual = (active: boolean) => {
    if (active) {
      btn.dataset.active = "true";
      btn.style.background = "rgba(0, 123, 255, 0.1)";
      btn.style.color = COLOR_PRIMARY;
    } else {
      delete btn.dataset.active;
      btn.style.background = "transparent";
      btn.style.color = "var(--text-muted)";
    }
  };

  const btn = createIconButton(
    GRID_BEAT_ICON,
    () => {
      const piano = deps.pianoRoll;
      if (!piano) return;

      const current = piano.getGridMode();
      const next = current === "seconds" ? "beats" : "seconds";
      piano.setGridMode(next);
      updateVisual(next === "beats");

      // Update tooltip based on timing data availability
      const instance = piano._instance;
      if (next === "beats" && instance && !instance.musicalTiming) {
        btn.title = "Beat grid (no timing data available — showing seconds)";
      } else {
        btn.title =
          next === "beats" ? "Grid: Beats (click for Seconds)" : "Grid: Seconds (click for Beats)";
      }
    },
    "Grid: Seconds (click for Beats)",
  );

  btn.setAttribute("aria-label", "Toggle grid mode (seconds / beats)");
  attachHoverBackground(btn);

  // Initial sync
  const initialMode = deps.pianoRoll?.getGridMode() ?? "seconds";
  updateVisual(initialMode === "beats");

  return btn;
}
