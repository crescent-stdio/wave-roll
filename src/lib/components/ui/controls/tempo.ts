import { COLOR_PRIMARY } from "@/lib/core/constants";
import { UIComponentDependencies } from "../types";

/**
 * Create a tempo control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The tempo control element.
 */
export function createTempoControl(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 12px;
      border-radius: 8px;
    `;

  // Tempo input
  const input = document.createElement("input");
  input.type = "number";
  input.min = "40";
  input.max = "400";
  input.value = "120";
  input.style.cssText = `
      width: 80px;
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      color: ${COLOR_PRIMARY};
      background: rgba(0, 123, 255, 0.08);
      outline: none;
      text-align: center;
    `;

  const label = document.createElement("span");
  label.textContent = "BPM";
  label.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

  // Tempo control logic
  input.addEventListener("input", () => {
    const tempo = parseFloat(input.value);
    if (!isNaN(tempo) && tempo >= 40 && tempo <= 400) {
      dependencies.audioPlayer?.setTempo(tempo);
    }
  });

  container.appendChild(input);
  container.appendChild(label);

  return container;
}
