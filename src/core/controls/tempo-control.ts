import { AudioPlayerControls } from "../../AudioPlayer";
import { COLOR_PRIMARY } from "../constants";

/**
 * Tempo control - numeric input with BPM label.
 */
export function createTempoControl(
  audioPlayer: AudioPlayerControls | null
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

  const tempoVal = audioPlayer?.getState().tempo ?? 120;

  // Numeric input (40-400 BPM)
  const input = document.createElement("input");
  input.type = "number";
  input.min = "40";
  input.max = "400";
  input.step = "0.1";
  input.value = tempoVal.toFixed(2);
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

  const clamp = (v: number) => Math.max(40, Math.min(400, v));

  const updateTempo = (val: number) => {
    const bpm = clamp(val);
    input.value = bpm.toString();
    audioPlayer?.setTempo(bpm);
  };

  // Events
  input.addEventListener("input", () =>
    updateTempo(parseFloat(input.value) || tempoVal)
  );
  input.addEventListener("focus", () => {
    input.style.background = "rgba(0, 123, 255, 0.15)";
    input.style.boxShadow = "0 0 0 3px rgba(0, 123, 255, 0.1)";
  });
  input.addEventListener("blur", () => {
    input.style.background = "rgba(0, 123, 255, 0.08)";
    input.style.boxShadow = "none";
    updateTempo(parseFloat(input.value) || tempoVal);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      input.blur();
    }
  });

  container.appendChild(input);
  container.appendChild(label);
  return container;
}
