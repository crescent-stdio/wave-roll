import { UIComponentDependencies } from "../../types";

/**
 * Build the "Offset Min Tolerance" input group.
 */
export function createOffsetMinToleranceGroup(
  deps: UIComponentDependencies
): HTMLDivElement {
  const group = document.createElement("div");
  group.style.cssText =
    "display:flex;align-items:center;gap:6px;font-size:12px;";

  const label = document.createElement("span");
  label.textContent = "Min Offset Tolerance (s):";
  label.style.cssText = "font-weight:600;min-width:120px;";

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "0.01";
  input.style.cssText =
    "flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;";

  // Set initial value from visual state (separate from evaluation tolerances)
  const visualState = deps.stateManager.getState().visual;
  input.value = String(visualState.minOffsetTolerance);

  input.addEventListener("change", () => {
    const value = parseFloat(input.value);
    if (!isNaN(value) && value >= 0) {
      deps.stateManager.updateVisualState({
        minOffsetTolerance: value,
      });
    }
  });

  // Listen for state changes to update input
  deps.stateManager.onStateChange(() => {
    const currentValue = deps.stateManager.getState().visual.minOffsetTolerance;
    if (parseFloat(input.value) !== currentValue) {
      input.value = String(currentValue);
    }
  });

  group.append(label, input);
  return group;
}
