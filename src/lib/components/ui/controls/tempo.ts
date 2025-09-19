import { COLOR_PRIMARY } from "@/lib/core/constants";
import { UIComponentDependencies } from "../types";

/**
 * Create a playback speed control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The playback speed control element.
 */
export function createTempoControlUI(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      height: 48px;
      background: var(--panel-bg);
      padding: 4px 12px;
      border-radius: 8px;
      box-shadow: var(--shadow-sm);
    `;

  // Playback speed input
  const input = document.createElement("input");
  input.type = "number";
  input.min = "10";
  input.max = "200";
  input.step = "5";
  input.value = "100"; // Default 100% (normal speed)
  input.style.cssText = `
      width: 60px;
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      color: var(--accent);
      background: rgba(37, 99, 235, 0.10);
      text-align: center;
    `;
  input.classList.add("wr-focusable");

  const label = document.createElement("span");
  label.textContent = "%";
  label.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
    `;

  // Focus effects
  input.addEventListener("focus", () => {
    input.style.background = "rgba(37, 99, 235, 0.12)";
  });

  input.addEventListener("blur", () => {
    input.style.background = "rgba(37, 99, 235, 0.10)";
  });

  // Helper to apply playback rate safely
  const applyRate = (rate: number) => {
    const r = Math.max(10, Math.min(200, Math.round(rate)));
    input.value = String(r);
    dependencies.audioPlayer?.setPlaybackRate(r);
    const state = dependencies.audioPlayer?.getState();
    if (state && dependencies.updateSeekBar) {
      dependencies.updateSeekBar({ currentTime: state.currentTime, duration: state.duration });
    }
  };

  // Apply on change (avoid partial 2 → 20 → 200 while typing)
  input.addEventListener("change", () => {
    const rate = parseFloat(input.value);
    if (!isNaN(rate)) applyRate(rate);
  });
  // Apply on Enter
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const rate = parseFloat(input.value);
      if (!isNaN(rate)) applyRate(rate);
      input.blur();
    }
  });

  // Adjust MIDI tempo button: prompt to enter percentage (10-200)
  const adjustBtn = document.createElement("button");
  adjustBtn.textContent = "Adjust MIDI tempo";
  adjustBtn.title = "Set playback speed (10-200%)";
  adjustBtn.style.cssText = `
    height: 28px; padding: 0 8px; border: none; border-radius: 6px;
    background: rgba(0,0,0,0.06); color: var(--text-primary); cursor: pointer; font-size: 12px; font-weight: 700;
  `;
  adjustBtn.onclick = () => {
    const current = parseFloat(input.value) || 100;
    const ans = window.prompt("Playback speed (10-200%)", String(current));
    if (ans !== null) {
      const val = Number(ans);
      if (!isNaN(val)) applyRate(val);
    }
  };

  // Initialize with current playback rate if available
  const currentState = dependencies.audioPlayer?.getState();
  if (currentState && currentState.playbackRate) {
    input.value = currentState.playbackRate.toString();
  }

  container.appendChild(input);
  container.appendChild(label);
  container.appendChild(adjustBtn);

  return container;
}
