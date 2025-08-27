/**
 * Master volume control for main toolbar
 */
import { FileVolumeControl } from "./file-volume";
import { PLAYER_ICONS } from "@/assets/player-icons";

export interface MasterVolumeOptions {
  initialVolume?: number;
  onVolumeChange?: (volume: number) => void;
}

export class MasterVolumeControl extends FileVolumeControl {
  constructor(options: MasterVolumeOptions = {}) {
    super({
      ...options,
      size: 28,
    });
    
    // Override styles for master volume
    const container = this.getElement();
    const button = container.querySelector("button");
    if (button) {
      button.style.cssText = `
        background: #e9ecef;
        border: none;
        padding: 6px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 6px;
        transition: all 0.2s ease;
        color: ${this.getVolume() > 0 ? 'var(--text-muted)' : 'rgba(71,85,105,0.5)'};
      `;
      
      // Add hover effect
      button.addEventListener("mouseenter", () => {
        button.style.background = "var(--hover-surface)";
      });
      button.addEventListener("mouseleave", () => {
        button.style.background = "var(--surface)";
      });
      
      button.setAttribute("aria-label", `Master volume: ${Math.round(this.getVolume() * 100)}%`);
      button.title = "Master Volume";
    }
    
    // Enhance slider container for master volume
    const sliderContainer = container.querySelector("div[style*='absolute']") as HTMLElement;
    if (sliderContainer) {
      // Slightly larger for master volume
      sliderContainer.style.width = "50px";
      sliderContainer.style.height = "160px";
      
      // Add "Master" label
      const label = document.createElement("div");
      label.textContent = "Master";
      label.style.cssText = `
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        margin-bottom: 4px;
        user-select: none;
      `;
      sliderContainer.insertBefore(label, sliderContainer.firstChild);
    }
  }
  
  public setVolume(volume: number): void {
    super.setVolume(volume);
    
    const button = this.getElement().querySelector("button");
    if (button) {
      button.setAttribute("aria-label", `Master volume: ${Math.round(this.getVolume() * 100)}%`);
    }
  }
}
