import { PLAYER_ICONS } from "@/assets/player-icons";
import { UIComponentDependencies } from "../types";
import { createIconButton } from "../utils/icon-button";
import { openZoomGridSettingsModal } from "../settings/modal/zoom-grid";

export function createSettingsControlUI(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    align-items: center;
  `;

  // Settings button
  const settingsBtn = createIconButton(PLAYER_ICONS.settings, () => {
    openZoomGridSettingsModal(dependencies);
  });
  settingsBtn.title = "Settings";
  container.appendChild(settingsBtn);

  return container;
}
