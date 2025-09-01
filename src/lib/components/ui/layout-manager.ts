import { PLAYER_ICONS } from "@/assets/player-icons";
import { MidiFileEntry } from "@/lib/core/midi";

import { UIComponentDependencies, UIElements } from "@/lib/components/ui";
import { FileItemFactory } from "@/lib/components/ui/file";
import {
  SIDEBAR_WIDTH,
  SIDEBAR_GAP,
  ICON_BUTTON_MARGIN,
  calcToggleButtonLeft,
} from "@/lib/components/ui/utils/sidebar-position";

/**
 * Provides layout & sidebar rendering for the Multi-MIDI demo.
 */
export class UILayoutManager {
  static setupLayout(
    container: HTMLElement,
    elements: UIElements,
    dependencies: UIComponentDependencies
  ): void {
    // Clear container first
    container.innerHTML = "";

    /* ---------- base flex layout ---------- */
    elements.mainContainer.style.cssText = `
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 600px;
      overflow: visible;
    `;

    /* player column (piano-roll + controls) */
    elements.playerContainer.style.cssText = `
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      padding: 16px;
    `;

    // Hide sidebar container since we're not using it
    elements.sidebarContainer.style.display = "none";

    // assemble DOM
    elements.mainContainer.appendChild(elements.playerContainer);

    // No sidebar toggle needed anymore

    container.appendChild(elements.mainContainer);

    /* ---------- window resize -> resize PixiJS canvas ---------- */
    const handleWindowResize = () => {
      const pr = dependencies.pianoRoll;
      if (pr?.resize) {
        const newWidth = elements.playerContainer.clientWidth;
        pr.resize(newWidth);
      }
    };

    window.addEventListener("resize", handleWindowResize);

    // Call once to ensure correct initial sizing if layout differs from default.
    handleWindowResize();
  }

  /* -------------------------------- sidebar -------------------------------- */
  // Deprecated - sidebar no longer used
  static setupSidebar(
    sidebarContainer: HTMLElement,
    dependencies: UIComponentDependencies
  ): void {
    // No-op: sidebar has been removed
  }

  /**
   * Refresh file list when midi-manager state changes.
   */
  // Deprecated - sidebar no longer used
  static updateSidebar(sidebarContainer: HTMLElement, midiManager: any): void {
    // No-op: sidebar has been removed
  }
}
