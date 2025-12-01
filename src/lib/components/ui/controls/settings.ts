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
    height: 48px;
    background: var(--panel-bg);
    padding: 4px 8px;
    border-radius: 8px;
    box-shadow: var(--shadow-sm);
  `;

  // Settings button
  const settingsBtn = createIconButton(PLAYER_ICONS.settings, () => {
    openZoomGridSettingsModal(dependencies);
  });
  settingsBtn.title = "Settings";
  container.appendChild(settingsBtn);

  // Appearance button (Palette, Color, Onset Marker) - only in solo mode
  // In non-solo mode, use "Tracks & Appearance" button in Files section
  if (dependencies.soloMode) {
    const appearanceBtn = createIconButton(PLAYER_ICONS.palette, () => {
      openSettingsModal(dependencies);
    });
    appearanceBtn.title = "Appearance";
    container.appendChild(appearanceBtn);
  }

  return container;
}
