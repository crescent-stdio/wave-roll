import { PLAYER_ICONS } from "@/assets/player-icons";
import { COLOR_PRIMARY } from "@/lib/core/constants";
import { attachHoverBackground } from "@/core/controls/utils/hover-background";
import { attachButtonScale } from "@/core/controls/utils/button-scale";
import { setupPlayButton } from "@/core/controls/utils/play-button";
import { attachRepeatToggle } from "@/core/controls/utils/repeat-toggle";
import { createIconButton } from "../utils/icon-button";
import { UIComponentDependencies } from "../types";

/**
 * Create a playback control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The playback control element.
 */
export function createPlaybackControlsUI(
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

  const updatePlayButton = setupPlayButton({
    playBtn,
    audioPlayer: dependencies.audioPlayer,
    postPlay: () => dependencies.updateSeekBar?.(),
  });

  // Apply scale effects and initial sync
  attachButtonScale(playBtn);
  updatePlayButton();

  dependencies.updatePlayButton = updatePlayButton;

  /* restart */
  const restartBtn = createIconButton(PLAYER_ICONS.restart, () => {
    dependencies.audioPlayer?.seek(0);
    if (!dependencies.audioPlayer?.getState().isPlaying) {
      dependencies.audioPlayer?.play();
    }
    updatePlayButton();
  });
  attachHoverBackground(restartBtn);

  /* repeat toggle */
  const repeatBtn = createIconButton(PLAYER_ICONS.repeat, () => {});
  attachRepeatToggle(repeatBtn, dependencies.audioPlayer);
  attachHoverBackground(repeatBtn);

  container.appendChild(restartBtn);
  container.appendChild(playBtn);
  container.appendChild(repeatBtn);
  return container;
}
