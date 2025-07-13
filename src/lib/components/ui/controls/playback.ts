import { PLAYER_ICONS } from "@/assets/player-icons";
import { COLOR_PRIMARY } from "@/lib/core/constants";
import { UIComponentDependencies } from "../types";

/**
 * Create a playback control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The playback control element.
 */
export function createPlaybackControls(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    gap: 4px;
    align-items: center;
    height: 48px;
    background: rgba(255, 255, 255, 0.8);
    padding: 4px;
    border-radius: 8px;
    position: relative;
    z-index: 10;
  `;

  /* ---------------- play / pause ---------------- */
  const playBtn = document.createElement("button");
  playBtn.innerHTML = PLAYER_ICONS.play;
  playBtn.style.cssText = `
    width: 40px;
    height: 40px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: ${COLOR_PRIMARY};
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    position: relative;
  `;

  const updatePlayButton = () => {
    const state = dependencies.audioPlayer?.getState();
    if (state?.isPlaying) {
      playBtn.innerHTML = PLAYER_ICONS.pause;
      playBtn.style.background = "#28a745";
      playBtn.onclick = () => {
        dependencies.audioPlayer?.pause();
        updatePlayButton();
      };
    } else {
      playBtn.innerHTML = PLAYER_ICONS.play;
      playBtn.style.background = COLOR_PRIMARY;
      playBtn.onclick = async () => {
        try {
          await dependencies.audioPlayer?.play();
          updatePlayButton();
          // Force immediate seekbar update (same as spacebar)
          dependencies.updateSeekBar?.();
        } catch (error) {
          console.error("Failed to play:", error);
          alert(
            `Failed to start playback: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      };
    }
  };

  playBtn.addEventListener("mouseenter", () => {
    playBtn.style.transform = "scale(1.05)";
  });
  playBtn.addEventListener("mouseleave", () => {
    playBtn.style.transform = "scale(1)";
  });
  playBtn.addEventListener("mousedown", () => {
    playBtn.style.transform = "scale(0.95)";
  });
  playBtn.addEventListener("mouseup", () => {
    playBtn.style.transform = "scale(1.05)";
  });

  updatePlayButton();
  dependencies.updatePlayButton = updatePlayButton;

  /* ---------------- helper for small buttons ---------------- */
  const mkBtn = (icon: string, onClick: () => void): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.innerHTML = icon;
    btn.onclick = onClick;
    btn.style.cssText = `
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #495057;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    `;
    btn.addEventListener("mouseenter", () => {
      if (!btn.dataset.active) btn.style.background = "rgba(0,0,0,0.05)";
    });
    btn.addEventListener("mouseleave", () => {
      if (!btn.dataset.active) btn.style.background = "transparent";
    });
    return btn;
  };

  /* restart */
  const restartBtn = mkBtn(PLAYER_ICONS.restart, () => {
    dependencies.audioPlayer?.seek(0);
    if (!dependencies.audioPlayer?.getState().isPlaying) {
      dependencies.audioPlayer?.play();
    }
    updatePlayButton();
  });

  /* repeat toggle */
  const repeatBtn = mkBtn(PLAYER_ICONS.repeat, () => {
    const state = dependencies.audioPlayer?.getState();
    const newRepeat = !state?.isRepeating;
    dependencies.audioPlayer?.toggleRepeat(newRepeat);
    if (newRepeat) {
      repeatBtn.dataset.active = "true";
      repeatBtn.style.background = "rgba(0, 123, 255, 0.1)";
      repeatBtn.style.color = COLOR_PRIMARY;
    } else {
      delete repeatBtn.dataset.active;
      repeatBtn.style.background = "transparent";
      repeatBtn.style.color = "#495057";
    }
  });

  container.appendChild(restartBtn);
  container.appendChild(playBtn);
  container.appendChild(repeatBtn);
  return container;
}
