import { COLOR_PRIMARY } from "@/lib/core/constants";
import { UIComponentDependencies } from "../types";

/**
 * Create a playback speed control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The playback speed control element.
 */
export function createTempoControlUI(
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

  // Playback speed input
  const input = document.createElement("input");
  input.type = "number";
  input.min = "10";
  input.max = "200";
  input.step = "5";
  input.value = "100"; // Default 100% (normal speed)
  input.style.cssText = `
      width: 60px;
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
  label.textContent = "%";
  label.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

  // Focus effects
  input.addEventListener("focus", () => {
    input.style.background = "rgba(0, 123, 255, 0.12)";
  });

  input.addEventListener("blur", () => {
    input.style.background = "rgba(0, 123, 255, 0.08)";
  });

  // Playback speed control logic
  input.addEventListener("input", () => {
    const rate = parseFloat(input.value);
    if (!isNaN(rate) && rate >= 10 && rate <= 200) {
      dependencies.audioPlayer?.setPlaybackRate(rate);
      // Force immediate UI update
      // Get fresh state after rate change
      const state = dependencies.audioPlayer?.getState();
      if (state && dependencies.updateSeekBar) {
        // Pass the full state including playbackRate to ensure UI updates
        dependencies.updateSeekBar(state as any);
      }
    }
  });

  // Initialize with current playback rate if available
  const currentState = dependencies.audioPlayer?.getState();
  if (currentState && currentState.playbackRate) {
    input.value = currentState.playbackRate.toString();
  }

  container.appendChild(input);
  container.appendChild(label);

  return container;
}