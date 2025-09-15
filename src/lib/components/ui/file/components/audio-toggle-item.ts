/**
 * WAV/MP3 audio file toggle item component
 */

import { PLAYER_ICONS } from "@/assets/player-icons";
import { UIComponentDependencies } from "@/lib/components/ui";
import { createIconButton } from "../../utils/icon-button";
import { FileVolumeControl } from "../../controls/file-volume";
import { ShapeRenderer } from "../utils/shape-renderer";

export interface AudioFileInfo {
  id: string;
  displayName: string;
  color: number;
  isVisible: boolean;
  isMuted: boolean;
  pan: number;
  volume?: number;
}

export class AudioToggleItem {
  /**
   * Create an audio file toggle item
   */
  static create(
    audio: AudioFileInfo,
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
    item.appendChild(this.createColorIndicator(audio));
    item.appendChild(this.createFileName(audio));
    item.appendChild(this.createVisibilityButton(audio, dependencies, item));
    item.appendChild(this.createVolumeControl(audio, dependencies));
    
    const { labelL, slider, labelR } = this.createPanControls(audio);
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

  private static createColorIndicator(audio: AudioFileInfo): HTMLElement {
    const colorHex = `#${audio.color.toString(16).padStart(6, "0")}`;
    return ShapeRenderer.createSquareColorChip(colorHex);
  }

  private static createFileName(audio: AudioFileInfo): HTMLElement {
    const name = document.createElement("span");
    name.textContent = audio.displayName;
    name.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: ${audio.isVisible ? "var(--text-primary)" : "var(--text-muted)"};
    `;
    return name;
  }

  private static createVisibilityButton(
    audio: AudioFileInfo,
    dependencies: UIComponentDependencies,
    item: HTMLElement
  ): HTMLButtonElement {
    const visBtn = createIconButton(
      audio.isVisible ? PLAYER_ICONS.eye_open : PLAYER_ICONS.eye_closed,
      () => {
        // Toggle visibility through global API
        const api = this.getAudioAPI();
        api?.toggleVisibility?.(audio.id);
        
        // Refresh the container
        const container = item.closest('[data-role="file-toggle"]') as HTMLElement | null;
        if (container && dependencies) {
          // Import is needed but we'll handle it in the main file
          const FileToggleManager = (window as any).FileToggleManager;
          if (FileToggleManager) {
            FileToggleManager.updateFileToggleSection(container, dependencies);
          }
        }

        // Dispatch visibility-change event so audio layer can react (join on become-visible)
        try {
          const files = api?.getFiles?.() || [];
          const f = files.find((x: any) => x.id === audio.id);
          const isVisible = !!f?.isVisible;
          window.dispatchEvent(
            new CustomEvent('wr-wav-visibility-changed', {
              detail: { id: audio.id, isVisible },
            })
          );
        } catch {}
      },
      "Toggle waveform visibility",
      { size: 24 }
    );
    
    visBtn.style.color = audio.isVisible
      ? "var(--text-muted)"
      : "rgba(71,85,105,0.5)";
    visBtn.style.border = "none";
    visBtn.style.boxShadow = "none";
    
    return visBtn;
  }

  private static createVolumeControl(
    audio: AudioFileInfo,
    dependencies: UIComponentDependencies
  ): HTMLElement {
    const volumeControl = new FileVolumeControl({
      initialVolume: audio.isMuted ? 0 : (audio.volume ?? 1.0),
      fileId: audio.id,
      lastNonZeroVolume: audio.volume ?? 1.0,
      onVolumeChange: (volume) => {
        // Update mute state based on volume
        const shouldMute = volume === 0;
        const api = this.getAudioAPI();
        
        if (api?.getFiles) {
          const files = api.getFiles() || [];
          const f = files.find((x: any) => x.id === audio.id);
          if (f && f.isMuted !== shouldMute) {
            api.toggleMute?.(audio.id);
            // Emit mute-changed so controller can align WAV join on unmute
            try {
              window.dispatchEvent(
                new CustomEvent('wr-wav-mute-changed', {
                  detail: { id: audio.id, isMuted: shouldMute },
                })
              );
            } catch {}
          }
        }

        // Apply volume to the audio player
        dependencies.audioPlayer?.setWavVolume?.(audio.id, volume);

        // Refresh audio players
        dependencies.audioPlayer?.refreshAudioPlayers?.();

        // Update silence detector for tracking
        dependencies.silenceDetector?.setWavVolume?.(audio.id, volume);
        dependencies.silenceDetector?.setWavMute?.(audio.id, shouldMute);
      },
    });

    const el = volumeControl.getElement();
    el.setAttribute('data-role', 'wav-volume');
    el.setAttribute('data-file-id', audio.id);
    return el;
  }

  private static createPanControls(
    audio: AudioFileInfo
  ): { labelL: HTMLElement; slider: HTMLInputElement; labelR: HTMLElement } {
    // Left label
    const labelL = document.createElement("span");
    labelL.textContent = "L";
    labelL.style.cssText = `font-size: 12px; color: var(--text-muted);`;

    // Right label
    const labelR = document.createElement("span");
    labelR.textContent = "R";
    labelR.style.cssText = `font-size: 12px; color: var(--text-muted);`;

    // Pan slider
    const panSlider = document.createElement("input");
    panSlider.type = "range";
    panSlider.min = "-100";
    panSlider.max = "100";
    panSlider.step = "1";
    panSlider.value = String((audio.pan ?? 0) * 100);
    panSlider.title = "Pan (L • R)";
    panSlider.style.cssText = `
      width: 80px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: var(--track-bg);
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;

    panSlider.addEventListener("input", () => {
      const pan = parseFloat(panSlider.value) / 100;
      const api = this.getAudioAPI();
      api?.setPan?.(audio.id, pan);
    });

    panSlider.addEventListener("dblclick", () => {
      const api = this.getAudioAPI();
      api?.setPan?.(audio.id, 0);
      panSlider.value = "0";
    });

    return { labelL, slider: panSlider, labelR };
  }

  /**
   * Get global audio API
   */
  private static getAudioAPI(): any {
    return (globalThis as any)._waveRollAudio;
  }
}