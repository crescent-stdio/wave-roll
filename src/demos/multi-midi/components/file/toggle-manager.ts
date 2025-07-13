import { PLAYER_ICONS } from "@/assets/player-icons";
import { MidiFileEntry } from "@/lib/core/midi";

import { UIComponentDependencies } from "@/lib/components/ui/types";

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

    // Title
    const title = document.createElement("h4");
    title.textContent = "File Visibility";
    title.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: #495057;
    `;
    fileToggleContainer.appendChild(title);

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
      background: white;
      border-radius: 4px;
      border: 1px solid #dee2e6;
    `;

    // Visibility toggle with eye icon
    const visBtn = document.createElement("button");
    visBtn.innerHTML = file.isVisible
      ? PLAYER_ICONS.eye_open
      : PLAYER_ICONS.eye_closed;
    visBtn.style.cssText = `
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${file.isVisible ? "#495057" : "#adb5bd"};
      transition: color 0.15s ease;
    `;

    visBtn.addEventListener("click", () => {
      dependencies.midiManager.toggleVisibility(file.id);
    });

    // Color indicator
    const colorIndicator = document.createElement("div");
    colorIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      border-radius: 2px;
      background: #${file.color.toString(16).padStart(6, "0")};
    `;

    // File name
    const fileName = document.createElement("span");
    fileName.textContent = file.displayName;
    fileName.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: ${file.isVisible ? "#343a40" : "#6c757d"};
    `;

    // Mute / Unmute toggle button
    const muteBtn = document.createElement("button");
    let isMuted = file.isMuted;
    muteBtn.innerHTML = isMuted ? PLAYER_ICONS.mute : PLAYER_ICONS.volume;
    muteBtn.style.cssText = `
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #adb5bd;
      transition: color 0.15s ease;
    `;

    muteBtn.addEventListener("click", () => {
      dependencies.midiManager.toggleMute(file.id);
      // Local state sync after manager toggles
      isMuted = !isMuted;
      muteBtn.innerHTML = isMuted ? PLAYER_ICONS.mute : PLAYER_ICONS.volume;
    });

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
      dependencies.audioPlayer?.setPan(panValue);
    });

    // Double-click → reset to center (0)
    panSlider.addEventListener("dblclick", () => {
      if (dependencies.filePanValues) {
        dependencies.filePanValues[file.id] = 0;
      }
      dependencies.audioPlayer?.setPan(0);
    });

    // Append elements in desired order
    item.appendChild(colorIndicator);
    item.appendChild(fileName);
    item.appendChild(visBtn);
    item.appendChild(muteBtn);
    item.appendChild(labelL);
    item.appendChild(panSlider);
    item.appendChild(labelR);

    return item;
  }
}
