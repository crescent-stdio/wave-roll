import { PLAYER_ICONS } from "@/assets/player-icons";
import { UIComponentDependencies } from "../types";
import { createIconButton } from "../utils/icon-button";
import { openZoomGridSettingsModal } from "../settings/modal/zoom-grid";
import { openSettingsModal } from "../settings/modal";

export function createSettingsControlUI(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    align-items: center;
    gap: 4px;
  `;

  // Settings button (View & Grid)
  const settingsBtn = createIconButton(PLAYER_ICONS.settings, () => {
    openZoomGridSettingsModal(dependencies);
  });
  settingsBtn.title = "View & Grid";
  container.appendChild(settingsBtn);

  // Appearance button (Palette, Color, Onset Marker)
  const appearanceBtn = createIconButton(PLAYER_ICONS.palette, () => {
    openSettingsModal(dependencies);
  });
  appearanceBtn.title = "Appearance";
  container.appendChild(appearanceBtn);

  return container;
}
