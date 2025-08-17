import { PLAYER_ICONS } from "@/assets/player-icons";
import { UIComponentDependencies } from "../types";

/**
 * Create a volume control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The volume control element.
 */
export function createVolumeControlUI(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 12px;
      border-radius: 8px;
    `;

  // Volume icon button
  const iconBtn = document.createElement("button");
  iconBtn.innerHTML = PLAYER_ICONS.volume;
  iconBtn.style.cssText = `
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      background: none;
      color: #495057;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s ease;
    `;

  // Volume slider
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = "100";
  slider.style.cssText = `
      width: 70px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: #e9ecef;
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;

  // Volume input
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "100";
  input.value = "100";
  input.style.cssText = `
      width: 52px;
      padding: 4px 6px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      color: #007bff;
      background: rgba(0, 123, 255, 0.08);
      outline: none;
      text-align: center;
    `;

  // Volume control logic
  const updateVolume = (percent: number) => {
    const vol = Math.max(0, Math.min(100, percent)) / 100;
    dependencies.audioPlayer?.setVolume(vol);
    slider.value = (vol * 100).toString();
    input.value = (vol * 100).toString();
  };

  slider.addEventListener("input", () => {
    updateVolume(parseFloat(slider.value));
  });

  input.addEventListener("input", () => {
    updateVolume(parseFloat(input.value));
  });

  container.appendChild(iconBtn);
  container.appendChild(slider);
  container.appendChild(input);

  return container;
}
