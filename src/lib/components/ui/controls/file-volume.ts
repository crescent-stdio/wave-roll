/**
 * Per-file volume control with vertical slider
 */
import { PLAYER_ICONS } from "@/assets/player-icons";

export interface VolumeControlOptions {
  initialVolume?: number; // 0-1
  onVolumeChange?: (volume: number) => void;
  size?: number;
  fileId?: string;
  lastNonZeroVolume?: number;
}

export class FileVolumeControl {
  private container: HTMLElement;
  private volumeBtn: HTMLButtonElement;
  private sliderContainer: HTMLDivElement;
  private slider: HTMLInputElement;
  private volumeDisplay: HTMLSpanElement;
  private currentVolume: number;
  private lastNonZeroVolume: number;
  private isSliderVisible: boolean = false;
  private hideTimeout: number | null = null;
  private onVolumeChange?: (volume: number) => void;

  constructor(options: VolumeControlOptions = {}) {
    this.currentVolume = options.initialVolume ?? 1.0;
    this.lastNonZeroVolume = options.lastNonZeroVolume ?? this.currentVolume;
    this.onVolumeChange = options.onVolumeChange;

    // Create container
    this.container = document.createElement("div");
    this.container.style.cssText = `
      position: relative;
      display: inline-flex;
      align-items: center;
    `;

    // Create volume button
    this.volumeBtn = document.createElement("button");
    this.updateVolumeIcon();
    this.volumeBtn.style.cssText = `
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      width: ${options.size ?? 24}px;
      height: ${options.size ?? 24}px;
      transition: opacity 0.2s ease;
      color: ${this.currentVolume > 0 ? "#495057" : "#adb5bd"};
    `;
    this.volumeBtn.setAttribute(
      "aria-label",
      `Volume: ${Math.round(this.currentVolume * 100)}%`
    );
    this.volumeBtn.setAttribute("role", "button");
    this.volumeBtn.setAttribute("tabindex", "0");

    // Create slider container
    this.sliderContainer = document.createElement("div");
    this.sliderContainer.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      margin-bottom: 4px;
      background: white;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      z-index: 1000;
      width: 40px;
      height: 140px;
    `;

    // Create volume display
    this.volumeDisplay = document.createElement("span");
    this.volumeDisplay.textContent = `${Math.round(this.currentVolume * 100)}%`;
    this.volumeDisplay.style.cssText = `
      font-size: 10px;
      color: #495057;
      font-weight: 600;
      user-select: none;
      margin-bottom: 4px;
    `;

    // Create vertical slider wrapper for proper positioning
    const sliderWrapper = document.createElement("div");
    sliderWrapper.style.cssText = `
      width: 24px;
      height: 80px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    // Create vertical slider
    this.slider = document.createElement("input");
    this.slider.type = "range";
    this.slider.min = "0";
    this.slider.max = "100";
    this.slider.step = "1";
    // Direct mapping for vertical display (bottom=0, top=100)
    this.slider.value = String(this.currentVolume * 100);
    this.slider.setAttribute("aria-label", "Volume slider");
    this.slider.setAttribute("aria-orientation", "vertical");
    this.slider.style.cssText = `
      width: 80px;
      height: 4px;
      transform: rotate(-90deg);
      transform-origin: center;
      position: absolute;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
      background: #dee2e6;
      outline: none;
      border-radius: 2px;
    `;

    // Style the slider thumb
    const style = document.createElement("style");
    const sliderId = `volume-slider-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.slider.className = sliderId;
    style.textContent = `
      .${sliderId}::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        background: #0d6efd;
        cursor: pointer;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }
      .${sliderId}::-moz-range-thumb {
        width: 12px;
        height: 12px;
        background: #0d6efd;
        cursor: pointer;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }
      .${sliderId}::-webkit-slider-runnable-track {
        background: linear-gradient(to right, #0d6efd 0%, #0d6efd ${this.currentVolume * 100}%, #dee2e6 ${this.currentVolume * 100}%, #dee2e6 100%);
      }
    `;
    document.head.appendChild(style);

    // Add slider to wrapper
    sliderWrapper.appendChild(this.slider);

    // Assemble slider container
    this.sliderContainer.appendChild(this.volumeDisplay);
    this.sliderContainer.appendChild(sliderWrapper);

    // Assemble main container
    this.container.appendChild(this.volumeBtn);
    this.container.appendChild(this.sliderContainer);

    // Event handlers
    this.setupEventHandlers();

    // Ensure track background reflects the initial value immediately
    this.updateSliderTrack();
  }

  private setupEventHandlers(): void {
    // Volume button click - toggle mute
    this.volumeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.currentVolume > 0) {
        this.lastNonZeroVolume = this.currentVolume;
        this.setVolume(0);
      } else {
        this.setVolume(this.lastNonZeroVolume);
      }
    });

    // Show slider on hover/focus
    this.volumeBtn.addEventListener("mouseenter", () => this.showSlider());
    this.volumeBtn.addEventListener("focus", () => this.showSlider());
    this.sliderContainer.addEventListener("mouseenter", () =>
      this.clearHideTimeout()
    );
    this.sliderContainer.addEventListener("mouseleave", () =>
      this.hideSliderDelayed()
    );
    this.container.addEventListener("mouseleave", () =>
      this.hideSliderDelayed()
    );

    // Slider input - direct mapping (bottom=0, top=100)
    this.slider.addEventListener("input", (e) => {
      const rawValue = parseInt((e.target as HTMLInputElement).value);
      const value = rawValue / 100;
      this.setVolume(value);
    });

    // Keyboard navigation
    this.container.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hideSlider();
        this.volumeBtn.focus();
      } else if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        this.setVolume(Math.min(1, this.currentVolume + 0.05));
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        this.setVolume(Math.max(0, this.currentVolume - 0.05));
      }
    });
  }

  private showSlider(): void {
    this.clearHideTimeout();
    this.sliderContainer.style.display = "flex";
    this.isSliderVisible = true;
  }

  private hideSlider(): void {
    this.sliderContainer.style.display = "none";
    this.isSliderVisible = false;
  }

  private hideSliderDelayed(): void {
    this.clearHideTimeout();
    this.hideTimeout = window.setTimeout(() => {
      this.hideSlider();
    }, 300);
  }

  private clearHideTimeout(): void {
    if (this.hideTimeout !== null) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  private updateVolumeIcon(): void {
    if (this.currentVolume === 0) {
      this.volumeBtn.innerHTML = PLAYER_ICONS.mute;
    } else {
      this.volumeBtn.innerHTML = PLAYER_ICONS.volume;
    }
  }

  private updateSliderTrack(): void {
    const pct = this.currentVolume * 100;
    const trackStyle = `linear-gradient(to right, #0d6efd 0%, #0d6efd ${pct}%, #dee2e6 ${pct}%, #dee2e6 100%)`;
    (this.slider as any).style.background = trackStyle;
  }

  public setVolume(volume: number): void {
    this.currentVolume = Math.max(0, Math.min(1, volume));

    if (this.currentVolume > 0) {
      this.lastNonZeroVolume = this.currentVolume;
    }

    this.updateVolumeIcon();
    // Direct mapping for vertical display (bottom=0, top=100)
    this.slider.value = String(this.currentVolume * 100);
    this.volumeDisplay.textContent = `${Math.round(this.currentVolume * 100)}%`;
    this.volumeBtn.setAttribute(
      "aria-label",
      `Volume: ${Math.round(this.currentVolume * 100)}%`
    );
    this.volumeBtn.style.color = this.currentVolume > 0 ? "#495057" : "#adb5bd";
    this.updateSliderTrack();

    if (this.onVolumeChange) {
      this.onVolumeChange(this.currentVolume);
    }
  }

  public getVolume(): number {
    return this.currentVolume;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public destroy(): void {
    this.clearHideTimeout();
    this.container.remove();
  }
}
