/**
 * UIComponents - UI creation and layout management for MultiMidiDemo
 * Extracted from MultiMidiDemo.ts for better code organization
 */

import { PLAYER_ICONS } from "../../assets/player-icons";
import { MidiFileEntry, DEFAULT_PALETTES } from "../../MultiMidiManager";
import { COLOR_PRIMARY, COLOR_A, COLOR_B, COLOR_OVERLAP } from "./ColorUtils";
import { parseMidi } from "@/core/parsers/midi-parser";

/**
 * Interface for UI component dependencies
 */
export interface UIComponentDependencies {
  midiManager: any;
  audioPlayer: any;
  pianoRollInstance: any;
  filePanStateHandlers: Record<string, (pan: number | null) => void>;
  filePanValues: Record<string, number>;
  muteDueNoLR: boolean;
  lastVolumeBeforeMute: number;
  minorTimeStep: number;
  loopPoints: { a: number | null; b: number | null } | null;
  seeking: boolean;
  updateSeekBar: (() => void) | null;
  updatePlayButton: (() => void) | null;
  updateMuteState: (shouldMute: boolean) => void;
  openSettingsModal: () => void;
  formatTime: (seconds: number) => string;
}

/**
 * Interface for UI elements
 */
export interface UIElements {
  mainContainer: HTMLElement;
  sidebarContainer: HTMLElement;
  playerContainer: HTMLElement;
  controlsContainer: HTMLElement;
  timeDisplay: HTMLElement;
  progressBar: HTMLElement | null;
  seekHandle: HTMLElement | null;
  currentTimeLabel: HTMLElement | null;
  totalTimeLabel: HTMLElement | null;
  seekBarContainer: HTMLElement | null;
  loopRegion: HTMLElement | null;
  markerA: HTMLElement | null;
  markerB: HTMLElement | null;
  progressIndicator: HTMLElement | null;
  markerATimeLabel: HTMLElement | null;
  markerBTimeLabel: HTMLElement | null;
  zoomInput: HTMLInputElement | null;
  fileToggleContainer: HTMLElement | null;
}

/**
 * Layout management functions
 */
export class UILayoutManager {
  static setupLayout(
    container: HTMLElement,
    elements: UIElements,
    dependencies: UIComponentDependencies
  ): void {
    // Clear container
    container.innerHTML = "";

    // Main container styles
    elements.mainContainer.style.cssText = `
      display: flex;
      gap: 20px;
      height: 100%;
      min-height: 600px;
    `;

    // Sidebar styles
    elements.sidebarContainer.style.cssText = `
      width: 280px;
      background: #f8f9fa;
      border-radius: 8px;
      padding: 16px;
      overflow-y: auto;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    `;

    // Player container styles - column layout so piano roll sits above controls
    elements.playerContainer.style.cssText = `
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    `;

    // Assemble layout
    elements.mainContainer.appendChild(elements.sidebarContainer);
    elements.mainContainer.appendChild(elements.playerContainer);
    container.appendChild(elements.mainContainer);

    // Initial sidebar setup
    this.setupSidebar(elements.sidebarContainer, dependencies);
  }

  static setupSidebar(
    sidebarContainer: HTMLElement,
    dependencies: UIComponentDependencies
  ): void {
    sidebarContainer.innerHTML = "";

    // Title
    const title = document.createElement("h3");
    title.textContent = "MIDI Files";
    title.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
      color: #343a40;
    `;
    sidebarContainer.appendChild(title);

    // File list container
    const fileListContainer = document.createElement("div");
    fileListContainer.id = "midi-file-list";
    fileListContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    `;
    sidebarContainer.appendChild(fileListContainer);

    // Add settings button at the bottom
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

  static updateSidebar(sidebarContainer: HTMLElement, midiManager: any): void {
    const fileList = document.getElementById("midi-file-list");
    if (!fileList) return;

    fileList.innerHTML = "";

    const state = midiManager.getState();

    state.files.forEach((file: MidiFileEntry) => {
      const fileItem = FileItemFactory.createFileItem(file, midiManager);
      fileList.appendChild(fileItem);
    });

    // Show empty state if no files
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

/**
 * Factory for creating file items
 */
export class FileItemFactory {
  static createFileItem(file: MidiFileEntry, midiManager: any): HTMLElement {
    const item = document.createElement("div");
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: white;
      border-radius: 6px;
      border: 1px solid #dee2e6;
      transition: all 0.2s ease;
    `;

    // Visibility toggle using eye icon
    const visBtn = document.createElement("button");
    const isVisible = file.isVisible;
    visBtn.innerHTML = isVisible
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
      color: ${isVisible ? "#495057" : "#adb5bd"};
      transition: color 0.15s ease;
    `;

    visBtn.addEventListener("click", () => {
      midiManager.toggleVisibility(file.id);
    });

    // Color indicator
    const colorIndicator = document.createElement("div");
    colorIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      border-radius: 3px;
      background: #${file.color.toString(16).padStart(6, "0")};
      flex-shrink: 0;
    `;

    // File name
    const fileName = document.createElement("span");
    fileName.textContent = file.displayName;
    fileName.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: ${file.isVisible ? "#343a40" : "#6c757d"};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;

    // Hover effect
    item.addEventListener("mouseenter", () => {
      item.style.borderColor = "#0984e3";
      item.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
    });

    item.addEventListener("mouseleave", () => {
      item.style.borderColor = "#dee2e6";
      item.style.boxShadow = "none";
    });

    item.appendChild(visBtn);
    item.appendChild(colorIndicator);
    item.appendChild(fileName);

    return item;
  }
}

/**
 * Main UI setup and control creation
 */
export class UIControlFactory {
  static setupUI(
    controlsContainer: HTMLElement,
    playerContainer: HTMLElement,
    dependencies: UIComponentDependencies
  ): void {
    controlsContainer.innerHTML = "";
    controlsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: #f8f9fa;
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    `;

    // First row: All controls (horizontal scroll if overflow)
    const controlsRow = document.createElement("div");
    controlsRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 20px;
      justify-content: flex-start;
      flex-wrap: nowrap;
      overflow-x: auto;
    `;

    // Group 1: Playback controls
    const playbackControls = this.createPlaybackControls(dependencies);
    controlsRow.appendChild(playbackControls);

    // Group 2: A-B Loop controls
    const loopControls = this.createLoopControls(dependencies);
    controlsRow.appendChild(loopControls);

    // Group 3: Volume Control
    const volumeControl = this.createVolumeControl(dependencies);
    controlsRow.appendChild(volumeControl);

    // Group 4: Tempo Control
    const tempoControl = this.createTempoControl(dependencies);
    controlsRow.appendChild(tempoControl);

    // Group 5: Pan Control (commented out in original)
    // const panControl = this.createPanControls(dependencies);
    // controlsRow.appendChild(panControl);

    // Group 6: Zoom Reset Control
    const zoomResetControl = this.createZoomControls(dependencies);
    controlsRow.appendChild(zoomResetControl);

    // Group 7: Settings Control
    const settingsControl = this.createSettingsControl(dependencies);
    controlsRow.appendChild(settingsControl);

    // Add to container
    controlsContainer.appendChild(controlsRow);

    // Second row: Time display and seek bar
    const timeDisplay = this.createTimeDisplay(dependencies);
    controlsContainer.appendChild(timeDisplay);

    // Add controls to player container
    playerContainer.appendChild(controlsContainer);
  }

  /**
   * Create main playback control buttons
   */
  static createPlaybackControls(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      gap: 4px;
      align-items: center;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px;
      border-radius: 8px;
      position: relative;
      z-index: 10;
    `;

    // Play/Pause button - Primary action, larger
    const playBtn = document.createElement("button");
    playBtn.innerHTML = PLAYER_ICONS.play;
    playBtn.style.cssText = `
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: ${COLOR_PRIMARY};
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      position: relative;
    `;

    // Function to update play button state and behavior
    const updatePlayButton = () => {
      const state = dependencies.audioPlayer?.getState();
      if (state?.isPlaying) {
        playBtn.innerHTML = PLAYER_ICONS.pause;
        playBtn.style.background = "#28a745";
        playBtn.onclick = () => {
          dependencies.audioPlayer?.pause();
          updatePlayButton();
        };
      } else {
        playBtn.innerHTML = PLAYER_ICONS.play;
        playBtn.style.background = COLOR_PRIMARY;
        playBtn.onclick = async () => {
          try {
            await dependencies.audioPlayer?.play();
            updatePlayButton();
          } catch (error) {
            console.error("Failed to play:", error);
            alert(
              `Failed to start playback: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        };
      }
    };

    // Play button hover effects
    playBtn.addEventListener("mouseenter", () => {
      playBtn.style.transform = "scale(1.05)";
    });
    playBtn.addEventListener("mouseleave", () => {
      playBtn.style.transform = "scale(1)";
    });
    playBtn.addEventListener("mousedown", () => {
      playBtn.style.transform = "scale(0.95)";
    });
    playBtn.addEventListener("mouseup", () => {
      playBtn.style.transform = "scale(1.05)";
    });

    // Set initial state
    updatePlayButton();

    // Store updatePlayButton for use in update loop
    dependencies.updatePlayButton = updatePlayButton;

    // Secondary buttons with flat design
    const createSecondaryButton = (
      icon: string,
      onClick: () => void
    ): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.innerHTML = icon;
      btn.onclick = onClick;
      btn.style.cssText = `
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: #495057;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      `;

      btn.addEventListener("mouseenter", () => {
        if (!btn.dataset.active) {
          btn.style.background = "rgba(0, 0, 0, 0.05)";
        }
      });
      btn.addEventListener("mouseleave", () => {
        if (!btn.dataset.active) {
          btn.style.background = "transparent";
        }
      });

      return btn;
    };

    // Restart button
    const restartBtn = createSecondaryButton(PLAYER_ICONS.restart, () => {
      dependencies.audioPlayer?.seek(0);
      if (!dependencies.audioPlayer?.getState().isPlaying) {
        dependencies.audioPlayer?.play();
      }
      updatePlayButton();
    });

    // Repeat toggle
    const repeatBtn = createSecondaryButton(PLAYER_ICONS.repeat, () => {
      const state = dependencies.audioPlayer?.getState();
      const newRepeat = !state?.isRepeating;
      dependencies.audioPlayer?.toggleRepeat(newRepeat);

      if (newRepeat) {
        repeatBtn.dataset.active = "true";
        repeatBtn.style.background = "rgba(0, 123, 255, 0.1)";
        repeatBtn.style.color = COLOR_PRIMARY;
      } else {
        delete repeatBtn.dataset.active;
        repeatBtn.style.background = "transparent";
        repeatBtn.style.color = "#495057";
      }
    });

    container.appendChild(restartBtn);
    container.appendChild(playBtn);
    container.appendChild(repeatBtn);

    return container;
  }

  /**
   * Create A-B loop controls
   */
  static createLoopControls(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      gap: 6px;
      align-items: center;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px;
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    `;

    // Virtual A-B points (in seconds)
    let pointA: number | null = null;
    let pointB: number | null = null;
    let isLooping = false;
    let isLoopRestartActive = false;

    // Create button helper
    const createLoopButton = (
      text: string,
      onClick: () => void,
      isActive = false
    ): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.textContent = text;
      btn.onclick = onClick;
      btn.style.cssText = `
        width: 32px;
        height: 32px;
        padding: 0;
        border: none;
        border-radius: 8px;
        background: ${isActive ? "rgba(0, 123, 255, 0.1)" : "transparent"};
        color: ${isActive ? COLOR_PRIMARY : "#495057"};
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      `;

      btn.addEventListener("mouseenter", () => {
        if (!btn.dataset.active) {
          btn.style.background = "rgba(0, 0, 0, 0.05)";
        }
      });
      btn.addEventListener("mouseleave", () => {
        if (!btn.dataset.active) {
          btn.style.background = "transparent";
        }
      });

      if (isActive) {
        btn.dataset.active = "true";
      }

      return btn;
    };

    // Loop restart button
    const btnLoopRestart = document.createElement("button");
    btnLoopRestart.innerHTML = PLAYER_ICONS.loop_restart;
    btnLoopRestart.onclick = () => {
      isLoopRestartActive = !isLoopRestartActive;

      if (isLoopRestartActive) {
        btnLoopRestart.dataset.active = "true";
        btnLoopRestart.style.background = "rgba(0, 123, 255, 0.1)";
        btnLoopRestart.style.color = COLOR_PRIMARY;

        if (pointA !== null && pointB !== null) {
          dependencies.audioPlayer?.setLoopPoints(pointA, pointB);
        } else if (pointA !== null) {
          dependencies.audioPlayer?.setLoopPoints(pointA, null);
        }

        const startPoint = pointA !== null ? pointA : 0;
        dependencies.audioPlayer?.seek(startPoint);
        if (!dependencies.audioPlayer?.getState().isPlaying) {
          dependencies.audioPlayer?.play();
        }
      } else {
        delete btnLoopRestart.dataset.active;
        btnLoopRestart.style.background = "transparent";
        btnLoopRestart.style.color = "#495057";
        dependencies.audioPlayer?.setLoopPoints(null, null);
      }
    };
    btnLoopRestart.style.cssText = `
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #495057;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    `;
    btnLoopRestart.title = "Toggle A-B Loop Mode";

    btnLoopRestart.addEventListener("mouseenter", () => {
      if (!btnLoopRestart.dataset.active) {
        btnLoopRestart.style.background = "rgba(0, 0, 0, 0.05)";
      }
    });
    btnLoopRestart.addEventListener("mouseleave", () => {
      if (!btnLoopRestart.dataset.active) {
        btnLoopRestart.style.background = "transparent";
      }
    });

    // A and B buttons (simplified - full implementation would be more complex)
    const btnA = createLoopButton(
      "A",
      () => {
        const state = dependencies.audioPlayer?.getState();
        if (state) {
          pointA = state.currentTime;
          btnA.style.background = COLOR_A;
          btnA.style.color = "white";
          btnA.dataset.active = "true";
          dependencies.updateSeekBar?.();
        }
      },
      false
    );

    const btnB = createLoopButton(
      "B",
      () => {
        const state = dependencies.audioPlayer?.getState();
        if (state) {
          pointB = state.currentTime;
          btnB.style.background = COLOR_B;
          btnB.style.color = "white";
          btnB.dataset.active = "true";
          dependencies.updateSeekBar?.();
        }
      },
      false
    );

    // Clear button
    const btnClear = createLoopButton("✕", () => {
      pointA = null;
      pointB = null;
      isLooping = false;
      btnA.style.background = "transparent";
      btnA.style.color = "#495057";
      delete btnA.dataset.active;
      btnB.style.background = "transparent";
      btnB.style.color = "#495057";
      delete btnB.dataset.active;
      dependencies.updateSeekBar?.();
    });
    btnClear.style.fontSize = "16px";
    btnClear.title = "Clear A-B Loop";

    container.appendChild(btnLoopRestart);
    container.appendChild(btnA);
    container.appendChild(btnB);
    container.appendChild(btnClear);

    return container;
  }

  /**
   * Create time display and seek bar
   */
  static createTimeDisplay(dependencies: UIComponentDependencies): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      background: white;
      padding: 14px 14px 10px 14px;
      border-radius: 8px;
      margin-top: 4px;
    `;

    // Current time label
    const currentTimeLabel = document.createElement("span");
    currentTimeLabel.style.cssText = `
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      font-size: 12px;
      font-weight: 500;
      color: #495057;
      min-width: 45px;
      text-align: right;
    `;
    currentTimeLabel.textContent = "00:00";

    // Seek bar container
    const seekBarContainer = document.createElement("div");
    seekBarContainer.style.cssText = `
      flex: 1;
      position: relative;
      height: 6px;
      background: #e9ecef;
      border-radius: 8px;
      cursor: pointer;
    `;

    // Progress bar
    const progressBar = document.createElement("div");
    progressBar.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, ${COLOR_PRIMARY}, #4dabf7);
      border-radius: 8px;
      width: 0%;
      transition: width 0.1s ease;
    `;

    // Seek handle
    const seekHandle = document.createElement("div");
    seekHandle.style.cssText = `
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 16px;
      height: 16px;
      background: ${COLOR_PRIMARY};
      border-radius: 50%;
      cursor: pointer;
      left: 0%;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      transition: left 0.1s ease;
    `;

    // Total time label
    const totalTimeLabel = document.createElement("span");
    totalTimeLabel.style.cssText = `
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      font-size: 12px;
      font-weight: 500;
      color: #6c757d;
      min-width: 45px;
    `;
    totalTimeLabel.textContent = "00:00";

    // Assemble seek bar
    seekBarContainer.appendChild(progressBar);
    seekBarContainer.appendChild(seekHandle);

    // Assemble container
    container.appendChild(currentTimeLabel);
    container.appendChild(seekBarContainer);
    container.appendChild(totalTimeLabel);

    /**
     * ---- Seek-bar logic ----
     */
    const updateSeekBar = (): void => {
      const state = dependencies.audioPlayer?.getState();
      if (!state || state.duration === 0) {
        return;
      }

      const percent = (state.currentTime / state.duration) * 100;
      progressBar.style.width = `${percent}%`;
      seekHandle.style.left = `${percent}%`;

      // Update labels
      currentTimeLabel.textContent = dependencies.formatTime(state.currentTime);
      totalTimeLabel.textContent = dependencies.formatTime(state.duration);
    };

    // Expose to external update loop
    dependencies.updateSeekBar = updateSeekBar;

    // Initial draw
    updateSeekBar();

    /** Click / seek interaction */
    const handleSeek = (evt: MouseEvent): void => {
      const rect = seekBarContainer.getBoundingClientRect();
      const percent = (evt.clientX - rect.left) / rect.width;
      const state = dependencies.audioPlayer?.getState();
      if (!state || state.duration === 0) {
        return;
      }
      const newTime = Math.max(
        0,
        Math.min(state.duration * percent, state.duration)
      );
      dependencies.audioPlayer?.seek(newTime, true);
      updateSeekBar();
    };

    seekBarContainer.addEventListener("click", handleSeek);

    return container;
  }

  /**
   * Create volume control
   */
  static createVolumeControl(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 12px;
      border-radius: 8px;
    `;

    // Volume icon button
    const iconBtn = document.createElement("button");
    iconBtn.innerHTML = PLAYER_ICONS.volume;
    iconBtn.style.cssText = `
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      background: none;
      color: #495057;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s ease;
    `;

    // Volume slider
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = "70";
    slider.style.cssText = `
      width: 70px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: #e9ecef;
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;

    // Volume input
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.value = "70";
    input.style.cssText = `
      width: 52px;
      padding: 4px 6px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      color: #007bff;
      background: rgba(0, 123, 255, 0.08);
      outline: none;
      text-align: center;
    `;

    // Volume control logic
    const updateVolume = (percent: number) => {
      const vol = Math.max(0, Math.min(100, percent)) / 100;
      dependencies.audioPlayer?.setVolume(vol);
      slider.value = (vol * 100).toString();
      input.value = (vol * 100).toString();
    };

    slider.addEventListener("input", () => {
      updateVolume(parseFloat(slider.value));
    });

    input.addEventListener("input", () => {
      updateVolume(parseFloat(input.value));
    });

    container.appendChild(iconBtn);
    container.appendChild(slider);
    container.appendChild(input);

    return container;
  }

  /**
   * Create tempo control
   */
  static createTempoControl(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 12px;
      border-radius: 8px;
    `;

    // Tempo input
    const input = document.createElement("input");
    input.type = "number";
    input.min = "40";
    input.max = "400";
    input.value = "120";
    input.style.cssText = `
      width: 80px;
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      color: ${COLOR_PRIMARY};
      background: rgba(0, 123, 255, 0.08);
      outline: none;
      text-align: center;
    `;

    const label = document.createElement("span");
    label.textContent = "BPM";
    label.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

    // Tempo control logic
    input.addEventListener("input", () => {
      const tempo = parseFloat(input.value);
      if (!isNaN(tempo) && tempo >= 40 && tempo <= 400) {
        dependencies.audioPlayer?.setTempo(tempo);
      }
    });

    container.appendChild(input);
    container.appendChild(label);

    return container;
  }

  /**
   * Create pan controls
   */
  static createPanControls(dependencies: UIComponentDependencies): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 12px;
      border-radius: 8px;
    `;

    // Pan slider
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "-100";
    slider.max = "100";
    slider.value = "0";
    slider.style.cssText = `
      width: 80px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: #e9ecef;
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;

    const label = document.createElement("span");
    label.textContent = "Pan";
    label.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

    // Pan control logic
    slider.addEventListener("input", () => {
      const pan = parseFloat(slider.value) / 100;
      dependencies.audioPlayer?.setPan(pan);
    });

    container.appendChild(label);
    container.appendChild(slider);

    return container;
  }

  /**
   * Create zoom controls
   */
  static createZoomControls(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 8px;
      border-radius: 8px;
    `;

    // Numeric input for zoom factor
    const zoomInput = document.createElement("input");
    zoomInput.type = "number";
    zoomInput.min = "0.1";
    zoomInput.max = "10";
    zoomInput.step = "0.1";
    const initZoom = dependencies.pianoRollInstance?.getState?.().zoomX ?? 1;
    zoomInput.value = initZoom.toFixed(1);
    zoomInput.style.cssText = `
      width: 56px;
      padding: 4px 6px;
      border: 1px solid #ced4da;
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
      color: #20c997;
      background: #ffffff;
    `;

    const clampZoom = (v: number) => Math.max(0.1, Math.min(10, v));

    const applyZoom = () => {
      const num = parseFloat(zoomInput.value);
      if (isNaN(num)) return;
      const newZoom = clampZoom(num);
      const currentZoom =
        dependencies.pianoRollInstance?.getState?.().zoomX ?? 1;
      const factor = newZoom / currentZoom;
      dependencies.pianoRollInstance?.zoomX?.(factor);
      zoomInput.value = newZoom.toFixed(1);
    };

    zoomInput.addEventListener("change", applyZoom);
    zoomInput.addEventListener("blur", applyZoom);
    zoomInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        applyZoom();
        zoomInput.blur();
      }
    });

    // Wheel over zoomInput → adjust ±0.1 steps; preventDefault() requires passive: false
    zoomInput.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        const num = parseFloat(zoomInput.value) || initZoom;
        zoomInput.value = (num + delta).toFixed(1);
        applyZoom();
      },
      { passive: false }
    );

    const suffix = document.createElement("span");
    suffix.textContent = "x";
    suffix.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

    // Reset button
    const resetBtn = document.createElement("button");
    resetBtn.innerHTML = PLAYER_ICONS.zoom_reset || "⟲";
    resetBtn.title = "Reset Zoom";
    resetBtn.style.cssText = `
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #495057;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    `;
    resetBtn.addEventListener("click", () => {
      dependencies.pianoRollInstance?.resetView?.();
      zoomInput.value = "1.0";
    });

    container.appendChild(zoomInput);
    container.appendChild(suffix);
    container.appendChild(resetBtn);

    // Expose zoomInput so outer update loop can sync value
    (dependencies as any).zoomInput = zoomInput;

    return container;
  }

  /**
   * Create settings control
   */
  static createSettingsControl(
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
    `;

    // Settings button
    const settingsBtn = this.createIconButton(PLAYER_ICONS.settings, () => {
      // Prevent multiple overlays
      if (document.getElementById("zoom-settings-overlay")) return;

      const overlay = document.createElement("div");
      overlay.id = "zoom-settings-overlay";
      overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,0.5);
        display:flex;justify-content:center;align-items:center;z-index:2000;
      `;

      const modal = document.createElement("div");
      modal.style.cssText = `
        width:320px;max-width:90%;background:#fff;border-radius:10px;
        padding:24px;display:flex;flex-direction:column;gap:16px;
      `;

      const header = document.createElement("div");
      header.style.cssText = `display:flex;justify-content:space-between;align-items:center;`;
      const title = document.createElement("h3");
      title.textContent = "Zoom / Grid Settings";
      title.style.cssText = `margin:0;font-size:16px;font-weight:700;`;
      const close = document.createElement("button");
      close.textContent = "✕";
      close.style.cssText = `border:none;background:transparent;font-size:20px;cursor:pointer;color:#6c757d;`;
      close.onclick = () => overlay.remove();
      header.appendChild(title);
      header.appendChild(close);

      // TimeStep
      const tsGroup = document.createElement("div");
      tsGroup.style.cssText = `display:flex;align-items:center;gap:6px;`;
      const tsLabel = document.createElement("span");
      tsLabel.textContent = "Grid step:";
      tsLabel.style.cssText = `font-size:12px;font-weight:600;`;
      const tsInput = document.createElement("input");
      tsInput.type = "number";
      tsInput.min = "0.1";
      tsInput.step = "0.1";
      const curStep = dependencies.pianoRollInstance?.getTimeStep?.() ?? 1;
      tsInput.value = curStep.toString();
      tsInput.style.cssText = `width:64px;padding:4px 6px;border:1px solid #ced4da;border-radius:6px;font-size:12px;text-align:center;`;
      const tsSuffix = document.createElement("span");
      tsSuffix.textContent = "s";
      tsSuffix.style.cssText = tsLabel.style.cssText;
      const applyTS = () => {
        const v = parseFloat(tsInput.value);
        if (!isNaN(v) && v > 0) {
          dependencies.pianoRollInstance?.setTimeStep?.(v);
        }
      };
      tsInput.addEventListener("change", applyTS);
      tsInput.addEventListener("blur", applyTS);
      tsGroup.appendChild(tsLabel);
      tsGroup.appendChild(tsInput);
      tsGroup.appendChild(tsSuffix);

      // Minor step
      const mnGroup = document.createElement("div");
      mnGroup.style.cssText = tsGroup.style.cssText;
      const mnLabel = document.createElement("span");
      mnLabel.textContent = "Minor step:";
      mnLabel.style.cssText = tsLabel.style.cssText;
      const mnInput = document.createElement("input");
      mnInput.type = "number";
      mnInput.min = "0.05";
      mnInput.step = "0.05";
      const curMinor =
        dependencies.pianoRollInstance?.getMinorTimeStep?.() ??
        dependencies.minorTimeStep;
      mnInput.value = curMinor.toString();
      mnInput.style.cssText = tsInput.style.cssText;
      const mnSuffix = document.createElement("span");
      mnSuffix.textContent = "s";
      mnSuffix.style.cssText = tsLabel.style.cssText;
      const applyMinor = () => {
        const v = parseFloat(mnInput.value);
        if (!isNaN(v) && v > 0) {
          dependencies.pianoRollInstance?.setMinorTimeStep?.(v);
        }
      };
      mnInput.addEventListener("change", applyMinor);
      mnInput.addEventListener("blur", applyMinor);
      mnGroup.appendChild(mnLabel);
      mnGroup.appendChild(mnInput);
      mnGroup.appendChild(mnSuffix);

      modal.appendChild(header);
      modal.appendChild(tsGroup);
      modal.appendChild(mnGroup);
      overlay.appendChild(modal);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
      });
      document.body.appendChild(overlay);
    });
    settingsBtn.title = "Zoom/Grid Settings";
    container.appendChild(settingsBtn);

    return container;
  }

  // Helper method
  static createIconButton(
    icon: string,
    onClick: () => void,
    title?: string
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.innerHTML = icon;
    btn.onclick = onClick;
    if (title) btn.title = title;
    btn.style.cssText = `
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #495057;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    `;
    return btn;
  }
}

/**
 * File toggle section management
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

    // Checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = file.isVisible;
    checkbox.addEventListener("change", () => {
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

    item.appendChild(checkbox);
    item.appendChild(colorIndicator);
    item.appendChild(fileName);

    return item;
  }
}

/**
 * Settings modal management
 */
export class SettingsModalManager {
  static openSettingsModal(dependencies: UIComponentDependencies): void {
    // Prevent multiple modals
    if (document.getElementById("multi-midi-settings-modal")) return;

    const overlay = document.createElement("div");
    overlay.id = "multi-midi-settings-modal";
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display:flex;
      justify-content:center;
      align-items:center;
      z-index:2000;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
      width:600px;max-width:95%;max-height:80vh;overflow-y:auto;
      background:#fff;border-radius:12px;padding:24px;display:flex;flex-direction:column;gap:24px;
    `;

    // Header
    const header = document.createElement("div");
    header.style.cssText = `display:flex;justify-content:space-between;align-items:center;`;
    const title = document.createElement("h2");
    title.textContent = "MIDI Settings";
    title.style.cssText = `margin:0;font-size:20px;font-weight:700;`;
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `border:none;background:transparent;font-size:24px;cursor:pointer;color:#6c757d;`;
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(title);
    header.appendChild(closeBtn);

    // Files section
    const filesSection = document.createElement("div");
    const filesHeader = document.createElement("h3");
    filesHeader.textContent = "MIDI Files";
    filesHeader.style.cssText = `margin:0 0 12px;font-size:16px;font-weight:600;`;
    filesSection.appendChild(filesHeader);

    const fileList = document.createElement("div");
    fileList.style.cssText = `display:flex;flex-direction:column;gap:8px;`;

    const refreshFileList = () => {
      fileList.innerHTML = "";
      dependencies.midiManager.getState().files.forEach((file: any) => {
        const row = document.createElement("div");
        row.style.cssText = `display:flex;align-items:center;gap:8px;background:#f8f9fa;padding:8px;border-radius:6px;`;

        const colorInput = document.createElement("input");
        colorInput.type = "color";
        colorInput.value = `#${file.color.toString(16).padStart(6, "0")}`;
        colorInput.onchange = (e) => {
          const hex = (e.target as HTMLInputElement).value;
          dependencies.midiManager.updateColor(
            file.id,
            parseInt(hex.substring(1), 16)
          );
        };

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = file.displayName;
        nameInput.onchange = (e) => {
          dependencies.midiManager.updateDisplayName(
            file.id,
            (e.target as HTMLInputElement).value
          );
        };
        nameInput.style.cssText = `flex:1;padding:4px 6px;border:1px solid #ced4da;border-radius:4px;`;

        const delBtn = document.createElement("button");
        delBtn.textContent = "🗑";
        delBtn.style.cssText = `border:none;background:transparent;cursor:pointer;font-size:16px;`;
        delBtn.onclick = () => {
          if (confirm(`Delete ${file.displayName}?`)) {
            dependencies.midiManager.removeMidiFile(file.id);
            refreshFileList();
          }
        };

        row.appendChild(colorInput);
        row.appendChild(nameInput);
        row.appendChild(delBtn);
        fileList.appendChild(row);
      });
    };
    refreshFileList();

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add MIDI";
    addBtn.style.cssText = `padding:8px 12px;border:2px dashed #dee2e6;border-radius:6px;background:transparent;cursor:pointer;`;
    addBtn.onclick = () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".mid,.midi";
      input.multiple = true;
      input.onchange = async (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (!files) return;
        for (const f of Array.from(files)) {
          try {
            const parsed = await parseMidi(f);
            dependencies.midiManager.addMidiFile(f.name, parsed);
          } catch (err) {
            console.error(err);
            alert(`Failed to load ${f.name}`);
          }
        }
        refreshFileList();
      };
      input.click();
    };

    filesSection.appendChild(fileList);
    filesSection.appendChild(addBtn);

    // Palette section
    const paletteSection = document.createElement("div");
    const palHeader = document.createElement("h3");
    palHeader.textContent = "Palette";
    palHeader.style.cssText = `margin:24px 0 12px;font-size:16px;font-weight:600;`;
    paletteSection.appendChild(palHeader);

    const grid = document.createElement("div");
    grid.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;`;
    const allPalettes = [
      ...DEFAULT_PALETTES,
      ...dependencies.midiManager.getState().customPalettes,
    ];
    allPalettes.forEach((pal: any) => {
      const item = document.createElement("div");
      item.style.cssText = `border:2px solid #dee2e6;border-radius:6px;padding:6px;cursor:pointer;display:flex;flex-direction:column;gap:4px;align-items:center;`;
      if (pal.id === dependencies.midiManager.getState().activePaletteId) {
        item.style.borderColor = "#0984e3";
      }
      const name = document.createElement("span");
      name.textContent = pal.name;
      name.style.cssText = `font-size:12px;font-weight:600;`;
      const row = document.createElement("div");
      row.style.cssText = `display:flex;gap:2px;flex-wrap:wrap;`;
      pal.colors.slice(0, 6).forEach((c: number) => {
        const dot = document.createElement("div");
        dot.style.cssText = `width:12px;height:12px;border-radius:50%;background:#${c.toString(16).padStart(6, "0")}`;
        row.appendChild(dot);
      });
      item.appendChild(name);
      item.appendChild(row);
      item.onclick = () => {
        dependencies.midiManager.setActivePalette(pal.id);
        refreshFileList();
        overlay.remove();
      };
      grid.appendChild(item);
    });
    paletteSection.appendChild(grid);

    // assemble modal
    modal.appendChild(header);
    modal.appendChild(filesSection);
    modal.appendChild(paletteSection);
    overlay.appendChild(modal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }
}

/**
 * Utility functions
 */
export class UIUtils {
  static formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  static createElement(
    tag: string,
    styles: string,
    textContent?: string
  ): HTMLElement {
    const element = document.createElement(tag);
    element.style.cssText = styles;
    if (textContent) element.textContent = textContent;
    return element;
  }
}
