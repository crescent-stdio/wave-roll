import { applyTimeStep } from "@/core/controls/utils/apply-time-step";
import { UIComponentDependencies } from "../../types";

/**
 * Build the "Grid step" input row.
 */
export function createTimeStepGroup(
  deps: UIComponentDependencies
): HTMLDivElement {
  const tsGroup = document.createElement("div");
  tsGroup.style.cssText = `display:flex;align-items:center;gap:6px;`;
  const tsLabel = document.createElement("span");
  tsLabel.textContent = "Grid step:";
  tsLabel.style.cssText = `font-size:12px;font-weight:600;`;
  const tsInput = document.createElement("input");
  tsInput.type = "number";
  tsInput.min = "0.1";
  tsInput.step = "0.1";
  const curStep = deps.pianoRoll?.getTimeStep?.() ?? 1;
  tsInput.value = curStep.toString();
  tsInput.style.cssText = `width:64px;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;font-size:12px;text-align:center;`;
  const tsSuffix = document.createElement("span");
  tsSuffix.textContent = "s";
  tsSuffix.style.cssText = tsLabel.style.cssText;
  const applyTS = () =>
    applyTimeStep(
      deps.pianoRoll?.setTimeStep,
      parseFloat(tsInput.value)
    );
  tsInput.addEventListener("change", applyTS);
  tsInput.addEventListener("blur", applyTS);
  tsGroup.appendChild(tsLabel);
  tsGroup.appendChild(tsInput);
  tsGroup.appendChild(tsSuffix);
  return tsGroup;
}
