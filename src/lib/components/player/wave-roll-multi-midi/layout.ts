import { UILayoutManager } from "@/demos/multi-midi/components/ui/layout-manager";
import { UIElements, UIComponentDependencies } from "@/lib/components/ui/types";
import { WaveRollMultiMidiPlayerOptions } from "./types";
import { FileToggleManager } from "@/demos/multi-midi/components/file/toggle-manager";
import { setupUI } from "@/lib/components/ui/controls";
import { createAudioPlayer } from "@/core/audio";

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
    margin-bottom: 12px;
  `;
  uiElements.playerContainer.appendChild(pianoRollContainer);

  // Build playback & transport controls
  setupUI(uiElements.controlsContainer, uiElements.playerContainer, uiDeps);

  // Set up file toggle section (below controls)
  uiElements.fileToggleContainer = setupFileToggleSection(
    uiElements.playerContainer,
    uiDeps
  );

  // Start update loop
  // this.startUpdateLoop();
}

export function createDefaultConfig(): WaveRollMultiMidiPlayerOptions {
  return {
    audioController: {
      defaultVolume: 0.7,
      defaultTempo: 120,
      minTempo: 50,
      maxTempo: 200,
      updateInterval: 50,
    },
    pianoRoll: {
      width: 800,
      height: 400,
      backgroundColor: 0xf8f9fa,
      playheadColor: 0xff0000,
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
