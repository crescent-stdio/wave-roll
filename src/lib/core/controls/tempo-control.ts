import { COLOR_PRIMARY } from "@/lib/core/constants";
import { AudioPlayerContainer } from "../audio/player-types";

/**
 * Playback speed control - numeric input with percentage label.
 */
export function createTempoControl({
  audioPlayer,
}: {
  audioPlayer: AudioPlayerContainer;
}): HTMLElement {
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

  const currentState = audioPlayer.getState();
  const currentRate = (currentState as any).playbackRate || 100;

  // Numeric input (10-200%)
  const input = document.createElement("input");
  input.type = "number";
  input.min = "10";
  input.max = "200";
  input.step = "5";
  input.value = currentRate.toString();
  input.style.cssText = `
    width: 50px;
    padding: 4px 6px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    color: ${COLOR_PRIMARY};
    background: rgba(0, 123, 255, 0.08);
    outline: none;
    text-align: center;
  `;

  const label = document.createElement("span");
  label.textContent = "%";
  label.style.cssText = `
    font-size: 12px;
    font-weight: 600;
    color: #6c757d;
  `;

  const clamp = (v: number) => Math.max(10, Math.min(200, v));

  const updatePlaybackRate = (val: number) => {
    const rate = clamp(val);
    input.value = rate.toString();
    audioPlayer.setPlaybackRate(rate);
    try {
      // Force immediate UI refresh (seek bar + time labels)
      (window as any).requestIdleCallback?.(() => {
        try {
          const state = audioPlayer.getState();
          // If VisualizationEngine is used upstream, a periodic update loop exists,
          // but we still nudge the UI to reflect the new time scale instantly.
          (document as any).dispatchEvent?.(
            new CustomEvent("wr-force-ui-refresh", {
              detail: {
                currentTime: state.currentTime,
                duration: state.duration,
              },
              bubbles: true,
            })
          );
        } catch {}
      });
    } catch {}
  };

  // Events
  input.addEventListener("input", () =>
    updatePlaybackRate(parseFloat(input.value) || currentRate)
  );
  input.addEventListener("focus", () => {
    input.style.background = "rgba(0, 123, 255, 0.15)";
    input.style.boxShadow = "0 0 0 3px rgba(0, 123, 255, 0.1)";
  });
  input.addEventListener("blur", () => {
    input.style.background = "rgba(0, 123, 255, 0.08)";
    input.style.boxShadow = "none";
    updatePlaybackRate(parseFloat(input.value) || currentRate);
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
