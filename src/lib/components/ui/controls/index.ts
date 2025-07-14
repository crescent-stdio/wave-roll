import { UIComponentDependencies } from "../types";

import { createPlaybackControlsUI } from "./playback";
import { createLoopControlsUI } from "./loop";
import { createVolumeControlUI } from "./volume";
import { createTempoControlUI } from "./tempo";
import { createPanControlsUI } from "./pan";
import { createZoomControlsUI } from "./zoom";
import { createTimeDisplayUI } from "./time-display";
import { createSettingsControlUI } from "./settings";

/**
 * Assemble all UI sub-controls and inject them into the given containers.
 *
 * @param controlsContainer - Empty <div> that will receive controls.
 * @param playerContainer   - Parent <div> that also gets the seek/time row.
 * @param deps              - Collected dependencies required by each sub-control.
 */
export function setupUI(
  controlsContainer: HTMLElement,
  playerContainer: HTMLElement,
  deps: UIComponentDependencies
): void {
  // Reset container
  controlsContainer.innerHTML = "";
  controlsContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: #f8f9fa;
    padding: 12px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  `;

  // First row: playback / loop / misc controls
  const row = document.createElement("div");
  row.style.cssText = `
    display: flex;
    align-items: center;
    gap: 20px;
    justify-content: flex-start;
    flex-wrap: nowrap;
    overflow-x: auto;
  `;

  row.appendChild(createPlaybackControlsUI(deps));
  row.appendChild(createLoopControlsUI(deps));
  row.appendChild(createVolumeControlUI(deps));
  row.appendChild(createTempoControlUI(deps));
  row.appendChild(createPanControlsUI(deps));
  row.appendChild(createZoomControlsUI(deps));
  row.appendChild(createSettingsControlUI(deps));

  controlsContainer.appendChild(row);
  controlsContainer.appendChild(createTimeDisplayUI(deps));

  // Mount everything in the player container.
  playerContainer.appendChild(controlsContainer);
}
