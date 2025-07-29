import { UIComponentDependencies } from "../../types";
import { HighlightMode } from "@/core/state/types";

/**
 * Build the “Highlight Mode” select menu.
 */
export function createHighlightModeGroup(
  deps: UIComponentDependencies
): HTMLDivElement {
  const group = document.createElement("div");
  group.style.cssText =
    "display:flex;align-items:center;gap:6px;font-size:12px;";

  const label = document.createElement("span");
  label.textContent = "Highlight:";
  label.style.cssText = "font-weight:600;";

  const select = document.createElement("select");
  select.style.cssText =
    "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;";

  const modes: HighlightMode[] = [
    "file",
    "highlight-simple",
    "highlight-blend",
    "highlight-exclusive",
  ];

  modes.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  });

  // Set initial value
  select.value = deps.stateManager.getState().visual.highlightMode;

  select.addEventListener("change", () => {
    deps.stateManager.updateVisualState({
      highlightMode: select.value as HighlightMode,
    });
  });

  group.append(label, select);
  return group;
}
