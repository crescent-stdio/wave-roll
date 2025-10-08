/**
 * File Toggle Manager - Refactored version
 * Manages file visibility and per-file audio controls using modular components
 */

import { PLAYER_ICONS } from "@/assets/player-icons";
import { UIComponentDependencies } from "@/lib/components/ui";
import { FileToggleItem } from "./components/file-toggle-item";
import { AudioToggleItem, AudioFileInfo } from "./components/audio-toggle-item";
import { EvaluationControls } from "./components/evaluation-controls";

/**
 * Manages file visibility and per-file audio controls.
 */
export class FileToggleManager {
  /**
   * Setup the file toggle section
   */
  static setupFileToggleSection(
    playerContainer: HTMLElement,
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const fileToggleContainer = document.createElement("div");
    fileToggleContainer.setAttribute("data-role", "file-toggle");
    fileToggleContainer.style.cssText = `
      background: var(--surface-alt);
      padding: 12px 0;
      border-radius: 8px;
      margin-top: 12px;
    `;

    // Add header with title and buttons
    fileToggleContainer.appendChild(this.createHeader(dependencies));

    // Add WAV section
    fileToggleContainer.appendChild(this.createWavSection());

    // Add MIDI section
    fileToggleContainer.appendChild(this.createMidiSection());

    playerContainer.appendChild(fileToggleContainer);
    
    // Make manager globally available for AudioToggleItem
    (window as any).FileToggleManager = FileToggleManager;
    
    // Listen for WAV file changes (like MIDI subscribe)
    const handleAudioChange = () => {
      this.updateFileToggleSection(fileToggleContainer, dependencies);
    };
    window.addEventListener('wr-audio-files-changed', handleAudioChange);
    
    return fileToggleContainer;
  }

  /**
   * Create header with title and control buttons
   */
  private static createHeader(dependencies: UIComponentDependencies): HTMLElement {
    const headerContainer = document.createElement("div");
    headerContainer.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    `;

    // Title
    const title = document.createElement("h4");
    title.textContent = "Files";
    title.style.cssText = `
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
    `;

    // Button bar
    const btnBar = document.createElement("div");
    btnBar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
    `;

    btnBar.appendChild(this.createSettingsButton(dependencies));
    btnBar.appendChild(this.createEvaluationButton(dependencies));

    headerContainer.appendChild(title);
    headerContainer.appendChild(btnBar);

    return headerContainer;
  }

  /**
   * Create settings button
   */
  private static createSettingsButton(dependencies: UIComponentDependencies): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.innerHTML = `${PLAYER_ICONS.file} <span>Tracks & Appearance</span>`;
    btn.style.cssText = `
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      background: var(--surface);
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "var(--hover-surface)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "var(--surface)";
    });
    btn.addEventListener("click", () => {
      dependencies.openSettingsModal();
    });

    return btn;
  }

  /**
   * Create evaluation results button
   */
  private static createEvaluationButton(dependencies: UIComponentDependencies): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.innerHTML = `${PLAYER_ICONS.results} <span>Evaluation Results</span>`;
    btn.style.cssText = `
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      background: var(--surface);
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "var(--hover-surface)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "var(--surface)";
    });
    btn.addEventListener("click", () => {
      dependencies.openEvaluationResultsModal?.();
    });

    return btn;
  }

  /**
   * Create WAV files section
   */
  private static createWavSection(): HTMLElement {
    const container = document.createElement("div");

    // Header
    const header = document.createElement("h4");
    header.textContent = "WAV Files";
    header.style.cssText = `
      margin: 12px 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
    `;
    header.id = "audio-header";

    // Controls container
    const controls = document.createElement("div");
    controls.id = "audio-controls";
    controls.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    container.appendChild(header);
    container.appendChild(controls);

    return container;
  }

  /**
   * Create MIDI files section
   */
  private static createMidiSection(): HTMLElement {
    const container = document.createElement("div");

    // Header
    const header = document.createElement("h4");
    header.textContent = "MIDI Files";
    header.style.cssText = `
      margin: 12px 0 8px 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
    `;
    header.id = "midi-header";

    // Controls container
    const controls = document.createElement("div");
    controls.id = "file-controls";
    controls.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    container.appendChild(header);
    container.appendChild(controls);

    return container;
  }

  /**
   * Update the file toggle section
   */
  static updateFileToggleSection(
    fileToggleContainer: HTMLElement,
    dependencies: UIComponentDependencies
  ): void {
    // Ensure evaluation defaults
    EvaluationControls.ensureDefaults(dependencies);

    // Update visibility of sections
    this.updateSectionVisibility(fileToggleContainer, dependencies);

    // Update MIDI files
    this.updateMidiFiles(fileToggleContainer, dependencies);

    // Update WAV files
    this.updateWavFiles(fileToggleContainer, dependencies);
  }

  /**
   * Update section visibility based on file counts
   */
  private static updateSectionVisibility(
    container: HTMLElement,
    dependencies: UIComponentDependencies
  ): void {
    const audioHeader = container.querySelector("#audio-header") as HTMLElement | null;
    const midiHeader = container.querySelector("#midi-header") as HTMLElement | null;
    const audioControls = container.querySelector("#audio-controls") as HTMLElement | null;

    // Get file counts
    const midiCount = dependencies.midiManager.getState().files.length;
    const audioApi = (globalThis as any)._waveRollAudio;
    const audioList = audioApi?.getFiles?.() ?? [];
    const audioCount = Array.isArray(audioList) ? audioList.length : 0;

    // Show/hide sections
    if (audioHeader) {
      audioHeader.style.display = audioCount > 0 ? "" : "none";
    }
    if (audioControls) {
      audioControls.style.display = audioCount > 0 ? "" : "none";
    }
    if (midiHeader) {
      midiHeader.style.display = midiCount > 0 ? "" : "none";
    }
  }

  /**
   * Update MIDI file controls
   */
  private static updateMidiFiles(
    container: HTMLElement,
    dependencies: UIComponentDependencies
  ): void {
    const fileControls = container.querySelector("#file-controls");
    if (!fileControls) return;

    fileControls.innerHTML = "";
    const state = dependencies.midiManager.getState();

    state.files.forEach((file) => {
      const fileControl = FileToggleItem.create(file, dependencies);
      fileControls.appendChild(fileControl);
    });
  }

  /**
   * Update WAV file controls
   */
  private static updateWavFiles(
    container: HTMLElement,
    dependencies: UIComponentDependencies
  ): void {
    const audioControls = container.querySelector("#audio-controls");
    if (!audioControls) return;

    audioControls.innerHTML = "";
    
    const audioApi = (globalThis as any)._waveRollAudio;
    const audioList = audioApi?.getFiles?.() ?? [];
    
    const files = audioList as AudioFileInfo[];
    for (const audio of files) {
      const audioControl = AudioToggleItem.create(audio, dependencies);
      audioControls.appendChild(audioControl);
    }
  }
}