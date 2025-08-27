import { UIComponentDependencies } from "../types";

/**
 * Create a pan control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The pan control element.
 */
export function createPanControlsUI(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      height: 48px;
      background: var(--panel-bg);
      padding: 4px 12px;
      border-radius: 8px;
    `;

  // Pan slider
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "-100";
  slider.max = "100";
  slider.value = "0";
  slider.style.cssText = `
      width: 80px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: var(--track-bg);
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;

  const label = document.createElement("span");
  label.textContent = "Pan";
  label.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    `;

  // Sync pan value on input
  slider.addEventListener("input", () => {
    const panValue = parseFloat(slider.value) / 100; // -1 to 1
    dependencies.audioPlayer?.setPan(panValue);
  });

  // Double-click -> reset to center (0)
  slider.addEventListener("dblclick", () => {
    slider.value = "0"; // Update the slider UI to reflect the reset
    dependencies.audioPlayer?.setPan(0);
  });

  container.appendChild(label);
  container.appendChild(slider);

  return container;
}
