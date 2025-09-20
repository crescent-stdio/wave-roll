/**
 * MIDI file toggle item component
 */

import { PLAYER_ICONS } from "@/assets/player-icons";
import { MidiFileEntry } from "@/lib/core/midi";
import { UIComponentDependencies } from "@/lib/components/ui";
import { createIconButton } from "../../utils/icon-button";
import { FileVolumeControl } from "../../controls/file-volume";
import { ShapeRenderer } from "../utils/shape-renderer";
import { EvaluationControls } from "./evaluation-controls";

export class FileToggleItem {
  /**
   * Create a MIDI file toggle item
   */
  static create(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const item = document.createElement("div");
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: var(--surface-alt);
      border-radius: 6px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      border: 1px solid var(--ui-border);
    `;

    // Add all components
    item.appendChild(this.createColorIndicator(file, dependencies));
    item.appendChild(this.createFileName(file));

    // Group REF/EST buttons to reduce spacing specifically between them
    const evalGroup = document.createElement("div");
    evalGroup.style.cssText = `display:flex;align-items:center;gap:2px;`;
    evalGroup.appendChild(this.createReferenceButton(file, dependencies, item));
    evalGroup.appendChild(this.createEstimationButton(file, dependencies, item));
    item.appendChild(evalGroup);
    item.appendChild(this.createVisibilityButton(file, dependencies));
    item.appendChild(this.createSustainButton(file, dependencies));
    item.appendChild(this.createVolumeControl(file, dependencies));
    
    const { labelL, slider, labelR } = this.createPanControls(file, dependencies);
    item.appendChild(labelL);
    item.appendChild(slider);
    item.appendChild(labelR);

    // Dim/tooltip when master muted
    const handleMasterMirror = (e: Event) => {
      const detail = (e as CustomEvent<{ mode: 'mirror-mute' | 'mirror-restore' | 'mirror-set'; volume?: number }>).detail;
      if (!detail || !detail.mode) return;
      if (detail.mode === 'mirror-mute') {
        item.style.opacity = '0.6';
        item.title = 'Master muted — changes apply after unmute';
      } else if (detail.mode === 'mirror-restore') {
        item.style.opacity = '';
        item.removeAttribute('title');
      }
    };
    window.addEventListener('wr-master-mirror', handleMasterMirror);
    (item as any).__cleanupMasterMirror = () => window.removeEventListener('wr-master-mirror', handleMasterMirror);

    return item;
  }

  private static createColorIndicator(file: MidiFileEntry, dependencies: UIComponentDependencies): HTMLElement {
    const fileColor = `#${file.color.toString(16).padStart(6, "0")}`;
    return ShapeRenderer.createColorIndicator(file.id, fileColor, dependencies.stateManager as any);
  }

  private static createFileName(file: MidiFileEntry): HTMLElement {
    const fileName = document.createElement("span");
    fileName.textContent = file.displayName;
    fileName.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: ${file.isPianoRollVisible ? "var(--text-primary)" : "var(--text-muted)"};
    `;
    return fileName;
  }

  private static createReferenceButton(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies,
    container: HTMLElement
  ): HTMLButtonElement {
    const evalState = dependencies.stateManager.getState().evaluation;
    return EvaluationControls.createReferenceButton({
      fileId: file.id,
      isReference: evalState.refId === file.id,
      isEstimated: evalState.estIds.includes(file.id),
      dependencies,
      container: container.parentElement || container,
    });
  }

  private static createEstimationButton(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies,
    container: HTMLElement
  ): HTMLButtonElement {
    const evalState = dependencies.stateManager.getState().evaluation;
    return EvaluationControls.createEstimationButton({
      fileId: file.id,
      isReference: evalState.refId === file.id,
      isEstimated: evalState.estIds.includes(file.id),
      dependencies,
      container: container.parentElement || container,
    });
  }

  private static createVisibilityButton(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): HTMLButtonElement {
    const visBtn = createIconButton(
      file.isPianoRollVisible ? PLAYER_ICONS.eye_open : PLAYER_ICONS.eye_closed,
      () => dependencies.midiManager.toggleVisibility(file.id),
      "Toggle visibility",
      { size: 24 }
    );
    
    visBtn.style.color = file.isPianoRollVisible
      ? "var(--text-muted)"
      : "rgba(71,85,105,0.5)";
    visBtn.style.border = "none";
    visBtn.style.boxShadow = "none";
    
    return visBtn;
  }

  private static createSustainButton(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): HTMLButtonElement {
    const sustainBtn = document.createElement("button");
    const isSustainVisible = file.isSustainVisible ?? true;
    sustainBtn.innerHTML = PLAYER_ICONS.sustain;
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

    return sustainBtn;
  }

  private static createVolumeControl(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const volumeControl = new FileVolumeControl({
      initialVolume: file.isMuted ? 0 : (file.volume ?? 1.0),
      fileId: file.id,
      lastNonZeroVolume: file.volume ?? 1.0,
      onVolumeChange: (volume) => {
        // Update mute state based on volume
        const shouldMute = volume === 0;
        if (file.isMuted !== shouldMute) {
          dependencies.midiManager.toggleMute(file.id);
        }

        // Apply volume to the audio engine
        if (dependencies.audioPlayer?.setFileVolume) {
          dependencies.audioPlayer.setFileVolume(file.id, volume);
        }

        // Also explicitly call setFileMute to ensure mute state is properly set
        if (dependencies.audioPlayer?.setFileMute) {
          dependencies.audioPlayer.setFileMute(file.id, shouldMute);
        }

        // Update silence detector for tracking
        dependencies.silenceDetector?.setFileVolume?.(file.id, volume);
        dependencies.silenceDetector?.setFileMute?.(file.id, shouldMute);
      },
    });

    const el = volumeControl.getElement();
    el.setAttribute('data-role', 'file-volume');
    el.setAttribute('data-file-id', file.id);
    return el;
  }

  private static createPanControls(
    file: MidiFileEntry,
    dependencies: UIComponentDependencies
  ): { labelL: HTMLElement; slider: HTMLInputElement; labelR: HTMLElement } {
    // Left label
    const labelL = document.createElement("span");
    labelL.textContent = "L";
    labelL.style.cssText = `font-size: 12px; color: #6c757d;`;

    // Right label
    const labelR = document.createElement("span");
    labelR.textContent = "R";
    labelR.style.cssText = `font-size: 12px; color: #6c757d;`;

    // Pan slider
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

      // Per-file panning in v2
      dependencies.audioPlayer?.setFilePan?.(file.id, panValue);
    });

    // Double-click -> reset to center (0)
    panSlider.addEventListener("dblclick", () => {
      panSlider.value = "0";
      if (dependencies.filePanValues) {
        dependencies.filePanValues[file.id] = 0;
      }

      dependencies.audioPlayer?.setFilePan?.(file.id, 0);
    });

    return { labelL, slider: panSlider, labelR };
  }
}