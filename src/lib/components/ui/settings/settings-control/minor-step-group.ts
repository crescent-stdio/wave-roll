import { UIComponentDependencies } from "@/lib/components/ui";
import { applyTimeStep } from "@/core/controls/utils/apply-time-step";

/**
 * Build the "Minor step" input row.
 */
export function createMinorStepGroup(
  deps: UIComponentDependencies
): HTMLDivElement {
  const group = document.createElement("div");
  group.style.cssText =
    "display:flex;align-items:center;gap:6px;font-size:12px;";

  const label = document.createElement("span");
  label.textContent = "Minor step:";
  label.style.cssText = "font-weight:600;";

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0.05";
  input.step = "0.05";
  input.value =
    deps.pianoRoll?.getMinorTimeStep?.()?.toString() ??
    deps.minorTimeStep.toString();
  input.style.cssText =
    "width:64px;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;text-align:center;";

  const suffix = document.createElement("span");
  suffix.textContent = "s";
  suffix.style.cssText = label.style.cssText;

  const apply = () =>
    applyTimeStep(deps.pianoRoll?.setMinorTimeStep, input.value);
  input.addEventListener("change", apply);
  input.addEventListener("blur", apply);

  group.append(label, input, suffix);
  return group;
}
