import { PLAYER_ICONS } from "@/assets/player-icons";
import { UIComponentDependencies } from "../types";

/**
 * Create a volume control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The volume control element.
 */
export function createVolumeControlUI(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      height: 48px;
      background: var(--panel-bg);
      padding: 4px 12px;
      border-radius: 8px;
      box-shadow: var(--shadow-sm);
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
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s ease;
    `;
  iconBtn.classList.add("wr-focusable");

  // Volume slider
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
      background: var(--track-bg);
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;
  slider.classList.add("wr-slider", "wr-focusable");

  // Volume input
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "100";
  input.value = "100";
  input.style.cssText = `
      width: 52px;
      padding: 4px 6px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      background: rgba(37, 99, 235, 0.10);
      text-align: center;
    `;
  input.classList.add("wr-focusable");

  // Volume control logic
  // Keep track of the last non-zero volume so double-click can restore it
  let lastNonZeroVolume = 1.0;

  const updateVolume = (percent: number) => {
    const vol = Math.max(0, Math.min(100, percent)) / 100;
    // Apply to audio engine
    dependencies.audioPlayer?.setVolume(vol);

    // Reflect in UI controls
    const percentStr = (vol * 100).toString();
    slider.value = percentStr;
    input.value = percentStr;

    // Update icon visual state
    iconBtn.innerHTML = vol === 0 ? PLAYER_ICONS.mute : PLAYER_ICONS.volume;

    // Remember last audible volume for unmute restoration
    if (vol > 0) {
      lastNonZeroVolume = vol;
    }

    // Sync master volume to SilenceDetector for auto-pause
    const silenceDetector = (dependencies as any).silenceDetector;
    if (silenceDetector?.setMasterVolume) {
      silenceDetector.setMasterVolume(vol);
    }
  };

  slider.addEventListener("input", () => {
    updateVolume(parseFloat(slider.value));
  });

  input.addEventListener("input", () => {
    updateVolume(parseFloat(input.value));
  });

  // Double-click on the volume icon toggles mute <-> unmute
  // - Mute: set master volume to 0
  // - Unmute: restore the last non-zero master volume
  iconBtn.addEventListener("dblclick", () => {
    const current = Math.max(0, Math.min(100, parseFloat(slider.value))) / 100;
    if (current === 0) {
      updateVolume(lastNonZeroVolume * 100);
    } else {
      // Preserve current as last non-zero before muting
      if (current > 0) {
        lastNonZeroVolume = current;
      }
      updateVolume(0);
    }
  });

  container.appendChild(iconBtn);
  container.appendChild(slider);
  container.appendChild(input);

  return container;
}
