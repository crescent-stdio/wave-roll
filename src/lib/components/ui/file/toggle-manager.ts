import { PLAYER_ICONS } from "@/assets/player-icons";
import { MidiFileEntry } from "@/lib/core/midi";

import { UIComponentDependencies } from "@/lib/components/ui";
import { createIconButton } from "../utils/icon-button";

/**
 * Manages file visibility and per-file audio controls.
 */
export class FileToggleManager {
  static setupFileToggleSection(
    playerContainer: HTMLElement,
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const fileToggleContainer = document.createElement("div");
    fileToggleContainer.style.cssText = `
      background: #f8f9fa;
      padding: 12px;
      border-radius: 8px;
      margin-top: 12px;
    `;

    // Title and settings button container
    const headerContainer = document.createElement("div");
    headerContainer.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    `;
    
    // Title
    const title = document.createElement("h4");
    title.textContent = "MIDI Files";
    title.style.cssText = `
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #495057;
    `;
    
    // MIDI Settings button with file icon
    const midiSettingsBtn = document.createElement("button");
    midiSettingsBtn.innerHTML = `${PLAYER_ICONS.file} <span>Settings</span>`;
    midiSettingsBtn.style.cssText = `
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      background: #e9ecef;
      color: #495057;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    `;
    
    midiSettingsBtn.addEventListener("mouseenter", () => {
      midiSettingsBtn.style.background = "#dee2e6";
    });
    midiSettingsBtn.addEventListener("mouseleave", () => {
      midiSettingsBtn.style.background = "#e9ecef";
    });
    midiSettingsBtn.addEventListener("click", () => {
      dependencies.openSettingsModal();
    });
    
    headerContainer.appendChild(title);
    headerContainer.appendChild(midiSettingsBtn);
    fileToggleContainer.appendChild(headerContainer);

    // File controls container
    const fileControlsContainer = document.createElement("div");
    fileControlsContainer.id = "file-controls";
    fileControlsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    fileToggleContainer.appendChild(fileControlsContainer);

    playerContainer.appendChild(fileToggleContainer);
    return fileToggleContainer;
  }

  static updateFileToggleSection(
    fileToggleContainer: HTMLElement,
    dependencies: UIComponentDependencies
  ): void {
    const fileControls = fileToggleContainer.querySelector("#file-controls");
    if (!fileControls) return;

    fileControls.innerHTML = "";
    const state = dependencies.midiManager.getState();

    state.files.forEach((file: MidiFileEntry) => {
      const fileControl = this.createFileToggleItem(file, dependencies);
      fileControls.appendChild(fileControl);
    });
  }

  static createFileToggleItem(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const item = document.createElement("div");
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: #f8f9fa;
      border-radius: 6px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      border: 1px solid #dee2e6;
    `;

    // Color indicator
    const colorIndicator = document.createElement("div");
    colorIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      background: #${file.color.toString(16).padStart(6, "0")};
    `;

    // File name
    const fileName = document.createElement("span");
    fileName.textContent = file.displayName;
    fileName.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: ${file.isPianoRollVisible ? "#343a40" : "#6c757d"};
    `;

    // Visibility toggle with eye icon (reusable button)
    const visBtn = createIconButton(
      file.isPianoRollVisible ? PLAYER_ICONS.eye_open : PLAYER_ICONS.eye_closed,
      () => dependencies.midiManager.toggleVisibility(file.id),
      "Toggle visibility",
      { size: 24 }
    );
    visBtn.style.color = file.isPianoRollVisible ? "#495057" : "#adb5bd";
    visBtn.style.border = "none";
    visBtn.style.boxShadow = "none";

    /* -------- sustain toggle -------- */
    const sustainBtn = document.createElement("button");
    const isSustainVisible = (file as any).isSustainVisible ?? true;
    sustainBtn.innerHTML = (PLAYER_ICONS as any).sustain ?? "S";
    sustainBtn.style.cssText = `
        width: 20px;
        height: 20px;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${isSustainVisible ? "#495057" : "#adb5bd"};
        transition: color 0.15s ease;
      `;

    sustainBtn.addEventListener("click", () => {
      dependencies.midiManager.toggleSustainVisibility(file.id);
    });

    // Mute / Unmute toggle button (reusable button)
    let isMuted = file.isMuted;
    const muteBtn = createIconButton(
      isMuted ? PLAYER_ICONS.mute : PLAYER_ICONS.volume,
      () => {
        dependencies.midiManager.toggleMute(file.id);
        isMuted = !isMuted;
        muteBtn.innerHTML = isMuted ? PLAYER_ICONS.mute : PLAYER_ICONS.volume;
      },
      "Mute / Unmute",
      { size: 24 }
    );
    muteBtn.style.color = !file.isMuted ? "#495057" : "#adb5bd";
    muteBtn.style.border = "none";
    muteBtn.style.boxShadow = "none";

    // Stereo labels for clarity
    const labelL = document.createElement("span");
    labelL.textContent = "L";
    labelL.style.cssText = `font-size: 12px; color: #6c757d;`;

    const labelR = document.createElement("span");
    labelR.textContent = "R";
    labelR.style.cssText = `font-size: 12px; color: #6c757d;`;

    // Per-file Pan Slider (L/R)
    const panSlider = document.createElement("input");
    panSlider.type = "range";
    panSlider.min = "-100";
    panSlider.max = "100";
    panSlider.step = "1";
    const initPan = (dependencies.filePanValues?.[file.id] ?? 0) * 100;
    panSlider.value = initPan.toString();
    panSlider.title = "Pan (L • R)";
    panSlider.style.cssText = `
      width: 80px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: #e9ecef;
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;

    // Sync pan value on input
    panSlider.addEventListener("input", () => {
      const panValue = parseFloat(panSlider.value) / 100; // -1 to 1
      if (dependencies.filePanValues) {
        dependencies.filePanValues[file.id] = panValue;
      }

      // Prefer per-file panning if supported by the audio player
      const playerAny = dependencies.audioPlayer as any;
      if (playerAny?.setFilePan) {
        playerAny.setFilePan(file.id, panValue);
      } else {
        // Fallback to global pan (legacy single-file player)
        dependencies.audioPlayer?.setPan(panValue);
      }
    });

    // Double-click -> reset to center (0)
    panSlider.addEventListener("dblclick", () => {
      if (dependencies.filePanValues) {
        dependencies.filePanValues[file.id] = 0;
      }

      const playerAny = dependencies.audioPlayer as any;
      if (playerAny?.setFilePan) {
        playerAny.setFilePan(file.id, 0);
      } else {
        dependencies.audioPlayer?.setPan(0);
      }
    });

    // order: color - name - vis - sustain - mute - pan - (eye)
    item.appendChild(colorIndicator);
    item.appendChild(fileName);
    item.appendChild(visBtn);
    item.appendChild(sustainBtn);
    item.appendChild(muteBtn);
    item.appendChild(labelL);
    item.appendChild(panSlider);
    item.appendChild(labelR);
    return item;
  }
}
