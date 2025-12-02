import { UIComponentDependencies } from "../types";

import { createPlaybackControlsUI } from "./playback";
import { createLoopControlsUI } from "./loop";
import { createVolumeControlUI } from "./volume";
import { createTempoControlUI } from "./tempo";
import { createZoomControlsUI } from "./zoom";
import { createTimeDisplayUI } from "./time-display";
import { createSettingsControlUI } from "./settings";
import { createHighlightModeGroup } from "../settings/controls/highlight-mode-group";

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
    width: 100%;
    box-sizing: border-box;
    background: var(--surface-alt);
    color: var(--text-primary);
    padding: 12px;
    border-radius: 8px;
    box-shadow: var(--shadow-sm);
    position: relative;
    z-index: 10;
  `;

  // First row: playback / loop / misc controls
  const row = document.createElement("div");
  row.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: flex-start;
    flex-wrap: wrap;
    overflow: visible;
  `;

  row.appendChild(createPlaybackControlsUI(deps));
  row.appendChild(createVolumeControlUI(deps));
  row.appendChild(createLoopControlsUI(deps));
  row.appendChild(createTempoControlUI(deps));
  row.appendChild(createZoomControlsUI(deps));
  // Hide highlight mode (Show notes) dropdown in solo mode
  if (!deps.soloMode) {
    row.appendChild(createHighlightModeGroup(deps, { withWrapper: true }));
  }
  row.appendChild(createSettingsControlUI(deps));

  controlsContainer.appendChild(row);
  controlsContainer.appendChild(createTimeDisplayUI(deps));

  // Mount everything in the player container.
  playerContainer.appendChild(controlsContainer);
}
