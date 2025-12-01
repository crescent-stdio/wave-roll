import { UILayoutManager } from "@/lib/components/ui/layout-manager";
import { COLOR_PLAYHEAD } from "@/lib/core/constants";
import { UIElements, UIComponentDependencies } from "@/lib/components/ui";
import { WaveRollPlayerOptions } from "./types";
import { FileToggleManager } from "@/lib/components/ui/file/toggle-manager";
// NOTE: setupUI is intentionally imported in player after piano-roll initialisation.
// createAudioPlayer is not required here.

/**
 * Set up the main layout
 */
export function setupLayout(
  container: HTMLElement,
  uiElements: UIElements,
  uiDeps: UIComponentDependencies,
  pianoRollContainer: HTMLElement
): void {
  UILayoutManager.setupLayout(container, uiElements, uiDeps);

  // Set up sidebar
  UILayoutManager.setupSidebar(uiElements.sidebarContainer, uiDeps);

  // Attach piano-roll area to the player container (above the controls)
  pianoRollContainer.style.cssText = `
    width: 100%;
    height: 400px;
    min-height: 400px;
    margin-bottom: 12px;
    background: var(--surface-alt);
    border-radius: 8px;
    position: relative;
    z-index: 1;
  `;
  uiElements.playerContainer.appendChild(pianoRollContainer);

  // Build playback & transport controls
  // NOTE: Controls and file toggle section will be set up later, once the
  // audio player and piano-roll are fully initialised. This avoids runtime
  // errors when they are accessed before being ready.
}

export function createDefaultConfig(): WaveRollPlayerOptions {
  return {
    audioController: {
      defaultVolume: 1.0,
      defaultTempo: 120,
      minTempo: 50,
      maxTempo: 200,
      updateInterval: 50,
    },
    pianoRoll: {
      width: 800,
      height: 400,
      backgroundColor: 0xf8f9fa,
      // Use theme playhead color for better visibility
      playheadColor: parseInt(COLOR_PLAYHEAD.replace("#", ""), 16),
      showPianoKeys: true,
      noteRange: { min: 21, max: 108 },
      minorTimeStep: 0.1,
    },
    ui: {
      sidebarWidth: 280,
      minHeight: 600,
      updateInterval: 50,
    },
  };
}

export function setupFileToggleSection(
  playerContainer: HTMLElement,
  deps: UIComponentDependencies
): HTMLElement {
  return FileToggleManager.setupFileToggleSection(playerContainer, deps);
}
