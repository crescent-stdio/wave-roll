import { UIComponentDependencies } from "../types";
import { createIconButton } from "../utils/icon-button";
import { attachHoverBackground } from "@/core/controls/utils/hover-background";
import { COLOR_PRIMARY } from "@/lib/core/constants/index";
import { attachTooltip } from "../utils/tooltip";
import { PLAYER_ICONS } from "@/assets/player-icons";

/**
 * Create a grid mode toggle button for the main control bar.
 *
 * Toggles between 'seconds' (default) and 'beats' grid display mode.
 * Visual state follows the repeat-toggle pattern (active = blue tint).
 */
export function createGridModeControl(deps: UIComponentDependencies): HTMLElement {
  // Track current mode for tooltip
  let currentMode: "seconds" | "beats" = deps.pianoRoll?.getGridMode() ?? "seconds";
  let hasTimingData = true;

  const getTooltipText = (): string => {
    if (currentMode === "beats" && !hasTimingData) {
      return "Grid: Beats (no timing data — showing seconds)";
    }
    return currentMode === "beats"
      ? "Grid: Beats (click for Seconds)"
      : "Grid: Seconds (click for Beats)";
  };

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
    PLAYER_ICONS.grid_beat,
    () => {
      const piano = deps.pianoRoll;
      if (!piano) return;

      const current = piano.getGridMode();
      const next = current === "seconds" ? "beats" : "seconds";
      piano.setGridMode(next);
      currentMode = next;
      updateVisual(next === "beats");

      // Check timing data availability
      const instance = piano._instance;
      hasTimingData = !!(instance && instance.musicalTiming);
    },
    "", // No native title - using DOM tooltip
  );

  btn.setAttribute("aria-label", "Toggle grid mode (seconds / beats)");
  attachHoverBackground(btn);
  attachTooltip(btn, { getText: getTooltipText });

  // Initial sync
  updateVisual(currentMode === "beats");

  return btn;
}
