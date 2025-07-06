import { AudioPlayerControls } from "../../AudioPlayer";
import { PLAYER_ICONS } from "../../assets/player-icons";
import { COLOR_PRIMARY } from "../constants";

/**
 * Build a volume control slider with icon and numeric input.
 * Returns the HTMLElement ready for insertion into UI.
 */
export function createVolumeControl(
  audioPlayer: AudioPlayerControls | null
): HTMLElement {
  /* ------------------------------------------------------------------
   * Container
   * ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
   * Volume icon (click-to-mute)
   * ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
   * Slider 0-100 %
   * ------------------------------------------------------------------ */
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = "100";
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

  /* ------------------------------------------------------------------
   * Numeric input 0-100 %
   * ------------------------------------------------------------------ */
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "100";
  input.value = "100";
  input.step = "1";
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

  /* ------------------------------------------------------------------
   * Custom slider thumb styling (only inject once)
   * ------------------------------------------------------------------ */
  const sliderStyleId = "volume-slider-style";
  if (!document.getElementById(sliderStyleId)) {
    const style = document.createElement("style");
    style.id = sliderStyleId;
    style.textContent = `
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        background: ${COLOR_PRIMARY};
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      input[type="range"]::-moz-range-thumb {
        width: 14px;
        height: 14px;
        background: ${COLOR_PRIMARY};
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      input[type="range"]:hover::-webkit-slider-thumb {
        transform: scale(1.2);
      }
      input[type="range"]:hover::-moz-range-thumb {
        transform: scale(1.2);
      }
    `;
    document.head.appendChild(style);
  }

  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  /** Update UI (slider, input, icon color) */
  const updateUI = (percent: number) => {
    const safe = clamp(percent);
    slider.value = safe.toString();
    input.value = safe.toString();
    if (safe === 0) {
      iconBtn.style.color = "#dc3545"; // mute red
    } else if (safe < 30) {
      iconBtn.style.color = "#ffc107"; // low vol yellow
    } else {
      iconBtn.style.color = "#495057";
    }
  };

  /** Set volume on AudioPlayer and update UI */
  const updateVolume = (percent: number) => {
    const vol = clamp(percent) / 100;
    audioPlayer?.setVolume(vol);
    updateUI(percent);
  };

  /* ------------------------------------------------------------------
   * Interactions
   * ------------------------------------------------------------------ */
  let previousVolume = 1;
  let isMuted = false;

  /** Toggle mute/unmute via icon button */
  iconBtn.addEventListener("click", () => {
    if (isMuted) {
      // Unmute: restore previous volume
      updateVolume(previousVolume * 100);
      isMuted = false;
      iconBtn.innerHTML = PLAYER_ICONS.volume;
    } else {
      // Mute: store current volume then set to 0
      previousVolume = parseFloat(slider.value) / 100;
      updateVolume(0);
      isMuted = true;
      iconBtn.innerHTML = PLAYER_ICONS.mute;
    }
  });

  slider.addEventListener("input", () => {
    const percent = parseFloat(slider.value);
    isMuted = percent === 0;
    if (!isMuted) {
      previousVolume = percent / 100;
    }
    updateVolume(percent);
    iconBtn.innerHTML = isMuted ? PLAYER_ICONS.mute : PLAYER_ICONS.volume;
  });

  const handleInputChange = () => {
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
      isMuted = val === 0;
      if (!isMuted) {
        previousVolume = val / 100;
      }
      updateVolume(val);
      iconBtn.innerHTML = isMuted ? PLAYER_ICONS.mute : PLAYER_ICONS.volume;
    }
  };
  input.addEventListener("input", handleInputChange);
  input.addEventListener("blur", handleInputChange);

  // Wheel over container adjusts ±1 (shift ±5)
  container.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      const newVal = clamp(parseFloat(slider.value) + delta);
      isMuted = newVal === 0;
      if (!isMuted) {
        previousVolume = newVal / 100;
      }
      updateVolume(newVal);
      iconBtn.innerHTML = isMuted ? PLAYER_ICONS.mute : PLAYER_ICONS.volume;
    },
    { passive: false }
  );

  // Global keyboard shortcuts - ArrowUp/Down, Shift+Arrow, M
  if (!(window as any)._volumeKeyHandlerAttached) {
    (window as any)._volumeKeyHandlerAttached = true;
    window.addEventListener("keydown", (e) => {
      if (
        ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName) &&
        e.target !== input
      ) {
        return;
      }
      if (e.key.toLowerCase() === "m") {
        iconBtn.click();
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const step = e.shiftKey ? 5 : 1;
        const dir = e.key === "ArrowUp" ? 1 : -1;
        const newVal = clamp(parseFloat(slider.value) + dir * step);
        isMuted = false;
        updateVolume(newVal);
      }
    });
  }

  // Initial sync
  updateVolume(100);
  iconBtn.innerHTML = PLAYER_ICONS.volume;

  container.appendChild(iconBtn);
  container.appendChild(slider);
  container.appendChild(input);

  return container;
}
