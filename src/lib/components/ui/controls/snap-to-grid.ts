import { UIComponentDependencies } from "../types";
import { createIconButton } from "../utils/icon-button";
import { attachHoverBackground } from "@/core/controls/utils/hover-background";
import { COLOR_PRIMARY } from "@/lib/core/constants/index";
import { createTooltipManager, TooltipManager } from "../utils/tooltip";
import type { SnapResolution } from "@/core/state/types";

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

/** Resolution options with display labels */
const RESOLUTION_OPTIONS: Array<{ value: SnapResolution; label: string }> = [
  { value: "beat", label: "Beat" },
  { value: "8th", label: "1/8" },
  { value: "16th", label: "1/16" },
  { value: "32nd", label: "1/32" },
  { value: "64th", label: "1/64" },
];

/**
 * Create a snap to grid control with toggle button and resolution dropdown.
 *
 * When enabled, note onsets are visually aligned to the nearest grid line.
 * Resolution can be beat, 8th notes, 16th notes, etc.
 * Only active when grid mode is "beats" (disabled in "seconds" mode).
 */
export function createSnapToGridControl(deps: UIComponentDependencies): HTMLElement {
  const { stateManager, pianoRoll } = deps;

  // Container wrapper for button + dropdown
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;align-items:center;gap:2px;position:relative;";

  // Tooltip manager for Shadow DOM compatibility
  let tooltip: TooltipManager | null = null;

  const getTooltipText = (enabled: boolean): string => {
    const gridMode = pianoRoll?.getGridMode?.() ?? "seconds";
    if (gridMode === "seconds") {
      return "Snap to Grid: Enable Beats mode first";
    }

    const resolution = stateManager.getState().visual.snapResolution;
    const resLabel = RESOLUTION_OPTIONS.find((o) => o.value === resolution)?.label ?? resolution;

    if (enabled) {
      return `Snap to Grid: On (${resLabel})`;
    }
    return "Snap to Grid: Off";
  };

  const isBeatsMode = (): boolean => {
    return pianoRoll?.getGridMode?.() === "beats";
  };

  const updateVisual = (active: boolean) => {
    const beatsMode = isBeatsMode();

    // Update button appearance
    if (!beatsMode) {
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

    // Update dropdown state
    const dropdownDisabled = !beatsMode || !active;
    select.disabled = dropdownDisabled;
    select.style.opacity = dropdownDisabled ? "0.4" : "1";
    select.style.cursor = dropdownDisabled ? "not-allowed" : "pointer";
  };

  const initialEnabled = stateManager.getState().visual.snapToGridEnabled;
  const initialResolution = stateManager.getState().visual.snapResolution;

  // Toggle button
  const btn = createIconButton(
    SNAP_ICON,
    () => {
      if (!isBeatsMode()) return;

      const current = stateManager.getState().visual.snapToGridEnabled;
      stateManager.updateVisualState({ snapToGridEnabled: !current });
      updateVisual(!current);

      // Show tooltip on toggle
      if (tooltip) {
        tooltip.show(getTooltipText(!current), btn);
      }
    },
    "", // No native title - using custom tooltip
  );

  btn.setAttribute("aria-label", "Toggle snap to grid");
  attachHoverBackground(btn);

  // Resolution dropdown
  const select = document.createElement("select");
  select.style.cssText = `
    padding: 2px 4px;
    border: 1px solid var(--ui-border, #444);
    border-radius: 4px;
    background: var(--surface, #1a1a1a);
    color: var(--text-primary, #fff);
    font-size: 11px;
    cursor: pointer;
    outline: none;
  `;
  select.setAttribute("aria-label", "Snap resolution");

  RESOLUTION_OPTIONS.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });

  select.value = initialResolution;

  select.addEventListener("change", () => {
    stateManager.updateVisualState({
      snapResolution: select.value as SnapResolution,
    });

    // Show tooltip on resolution change
    if (tooltip) {
      const enabled = stateManager.getState().visual.snapToGridEnabled;
      tooltip.show(getTooltipText(enabled), select);
    }
  });

  // Assemble wrapper
  wrapper.appendChild(btn);
  wrapper.appendChild(select);

  // Initialize visual state
  updateVisual(initialEnabled);

  // Create tooltip after wrapper is in DOM (deferred)
  requestAnimationFrame(() => {
    tooltip = createTooltipManager(wrapper, { position: "top", duration: 2000 });

    // Show tooltip on hover
    btn.addEventListener("mouseenter", () => {
      const enabled = stateManager.getState().visual.snapToGridEnabled;
      tooltip?.show(getTooltipText(enabled), btn);
    });
    btn.addEventListener("mouseleave", () => tooltip?.hide());

    select.addEventListener("mouseenter", () => {
      const enabled = stateManager.getState().visual.snapToGridEnabled;
      tooltip?.show(getTooltipText(enabled), select);
    });
    select.addEventListener("mouseleave", () => tooltip?.hide());
  });

  return wrapper;
}
