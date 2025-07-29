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
      gap: 20px;
      height: 100%;
      min-height: 600px;
    `;

    /* sidebar (initially visible, absolute positioning so it doesn't occupy layout width) */
    elements.sidebarContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 280px;
      height: 100%;
      background: #f8f9fa;
      border-radius: 8px;
      padding: 16px;
      overflow-y: auto;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      transition: transform 0.3s ease;
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

    // Sidebar visible by default -> show it
    elements.sidebarContainer.style.transform = "translateX(0)";

    // Sidebar visible by default, add padding initially
    elements.mainContainer.style.paddingLeft = `${SIDEBAR_WIDTH + SIDEBAR_GAP}px`;

    // Hamburger button to toggle sidebar
    const toggleBtn = document.createElement("button");
    toggleBtn.innerHTML = PLAYER_ICONS.menu;
    // Initial left based on visible sidebar
    toggleBtn.style.cssText = `
      position: absolute;
      top: ${ICON_BUTTON_MARGIN}px;
      left: ${calcToggleButtonLeft(true)};
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 4px;
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      z-index: 10;
      transition: background 0.2s ease, left 0.3s ease;
    `;

    toggleBtn.addEventListener("mouseenter", () => {
      toggleBtn.style.background = "#f1f3f5";
    });
    toggleBtn.addEventListener("mouseleave", () => {
      toggleBtn.style.background = "#ffffff";
    });

    let sidebarVisible = true;
    toggleBtn.addEventListener("click", () => {
      sidebarVisible = !sidebarVisible;

      // move sidebar
      if (sidebarVisible) {
        elements.sidebarContainer.style.transform = "translateX(0)";
        elements.mainContainer.style.paddingLeft = `${SIDEBAR_WIDTH + SIDEBAR_GAP}px`;
      } else {
        elements.sidebarContainer.style.transform = "translateX(-120%)";
        elements.mainContainer.style.paddingLeft = "0px";
      }

      // reposition button
      toggleBtn.style.left = calcToggleButtonLeft(sidebarVisible);

      // Trigger PixiJS piano roll resize if available
      const pr = dependencies.pianoRoll as any;
      if (pr?.resize) {
        const newWidth = elements.playerContainer.clientWidth;
        // Keep existing height (400 as default)
        pr.resize(newWidth);
      }
    });

    /* ------------------------------------------------------------
     * Keyboard shortcut: press "b" to toggle the sidebar.
     * ---------------------------------------------------------- */
    window.addEventListener("keydown", (e) => {
      const isBKey = e.key.toLowerCase() === "b";
      const hasModifier = e.metaKey || e.ctrlKey || e.altKey || e.shiftKey;
      const isTypingTarget =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable;

      if (isBKey && !hasModifier && !isTypingTarget) {
        e.preventDefault();
        toggleBtn.click();
      }
    });

    elements.mainContainer.appendChild(toggleBtn);

    container.appendChild(elements.mainContainer);

    /* ---------- window resize -> resize PixiJS canvas ---------- */
    const handleWindowResize = () => {
      const pr = dependencies.pianoRoll as any;
      if (pr?.resize) {
        const newWidth = elements.playerContainer.clientWidth;
        pr.resize(newWidth);
      }
    };

    window.addEventListener("resize", handleWindowResize);

    // Call once to ensure correct initial sizing if layout differs from default.
    handleWindowResize();

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
