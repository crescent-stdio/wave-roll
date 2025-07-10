import { PLAYER_ICONS } from "@/assets/player-icons";
import { MidiFileEntry } from "../../MultiMidiManager";

import { UIComponentDependencies, UIElements } from "./types";
import { FileItemFactory } from "./file-item-factory";

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
      display: flex;
      gap: 20px;
      height: 100%;
      min-height: 600px;
    `;

    /* sidebar */
    elements.sidebarContainer.style.cssText = `
      width: 280px;
      background: #f8f9fa;
      border-radius: 8px;
      padding: 16px;
      overflow-y: auto;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    `;

    /* player column (piano-roll + controls) */
    elements.playerContainer.style.cssText = `
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    `;

    // assemble DOM
    elements.mainContainer.appendChild(elements.sidebarContainer);
    elements.mainContainer.appendChild(elements.playerContainer);
    container.appendChild(elements.mainContainer);

    // initial sidebar population
    this.setupSidebar(elements.sidebarContainer, dependencies);
  }

  /* -------------------------------- sidebar -------------------------------- */
  static setupSidebar(
    sidebarContainer: HTMLElement,
    dependencies: UIComponentDependencies
  ): void {
    sidebarContainer.innerHTML = "";

    // title
    const title = document.createElement("h3");
    title.textContent = "MIDI Files";
    title.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
      color: #343a40;
    `;
    sidebarContainer.appendChild(title);

    // container that will hold file entries
    const fileListContainer = document.createElement("div");
    fileListContainer.id = "midi-file-list";
    fileListContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    `;
    sidebarContainer.appendChild(fileListContainer);

    // settings button
    const settingsBtn = document.createElement("button");
    settingsBtn.innerHTML = `${PLAYER_ICONS.settings} <span>MIDI Settings</span>`;
    settingsBtn.style.cssText = `
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      background: #e9ecef;
      color: #495057;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
      margin-top: auto;
    `;

    settingsBtn.addEventListener("mouseenter", () => {
      settingsBtn.style.background = "#dee2e6";
    });
    settingsBtn.addEventListener("mouseleave", () => {
      settingsBtn.style.background = "#e9ecef";
    });
    settingsBtn.addEventListener("click", () => {
      dependencies.openSettingsModal();
    });

    sidebarContainer.appendChild(settingsBtn);
  }

  /**
   * Refresh file list when midi-manager state changes.
   */
  static updateSidebar(sidebarContainer: HTMLElement, midiManager: any): void {
    const fileList = document.getElementById("midi-file-list");
    if (!fileList) return;

    fileList.innerHTML = "";

    const state = midiManager.getState();

    state.files.forEach((file: MidiFileEntry) => {
      const fileItem = FileItemFactory.createFileItem(file, midiManager);
      fileList.appendChild(fileItem);
    });

    // empty state
    if (state.files.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.style.cssText = `
        text-align: center;
        color: #6c757d;
        padding: 40px 20px;
        font-size: 14px;
      `;
      emptyState.textContent =
        "No MIDI files loaded. Click settings to add files.";
      fileList.appendChild(emptyState);
    }
  }
}
