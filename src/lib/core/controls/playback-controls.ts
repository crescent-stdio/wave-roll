import { AudioPlayerContainer } from "@/lib/core/audio/audio-player";
import * as Tone from "tone";
import { PLAYER_ICONS } from "@/assets/player-icons";
import { COLOR_PRIMARY } from "@/lib/core/constants";
import { attachHoverBackground } from "@/core/controls/utils/hover-background";
import { attachButtonScale } from "@/core/controls/utils/button-scale";
import { setupPlayButton } from "@/core/controls/utils/play-button";
import { attachRepeatToggle } from "@/core/controls/utils/repeat-toggle";

export interface PlaybackControlsDeps {
  audioPlayer: AudioPlayerContainer;
}

export interface PlaybackControlsHandles {
  element: HTMLElement;
  updatePlayButton: () => void;
}

/**
 * Create playback control elements (restart, play/pause, repeat) and return
 * both the HTMLElement container and an updatePlayButton function that keeps
 * the play/pause button UI in sync with current playback state.
 */
export function createPlaybackControls(
  ctx: PlaybackControlsDeps
): PlaybackControlsHandles {
  const { audioPlayer } = ctx;

  /* ------------------------------------------------------------------
   * Container for playback buttons
   * ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------
   * Primary Play/Pause button
   * ------------------------------------------------------------------ */
  const playBtn = document.createElement("button");
  playBtn.innerHTML = PLAYER_ICONS.play;
  playBtn.style.cssText = `
    width: 32px;
    height: 32px;
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

  // Play / pause behaviour via shared util
  const updatePlayButton = setupPlayButton({
    playBtn,
    audioPlayer,
    prePlay: () => Tone.start(),
  });

  // Hover/press scale effects
  attachButtonScale(playBtn);

  // Initial sync
  updatePlayButton();

  /* ------------------------------------------------------------------
   * Helper to create secondary square icon buttons
   * ------------------------------------------------------------------ */
  const createSecondaryButton = (
    icon: string,
    onClick: () => void
  ): HTMLButtonElement => {
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

    attachHoverBackground(btn);

    return btn;
  };

  /* ------------------------------------------------------------------
   * Restart button - seeks to 0 and auto-plays if not already playing
   * ------------------------------------------------------------------ */
  const restartBtn = createSecondaryButton(PLAYER_ICONS.restart, () => {
    audioPlayer?.seek(0);
    if (!audioPlayer?.getState().isPlaying) {
      audioPlayer?.play();
    }
    updatePlayButton();
  });

  /* ------------------------------------------------------------------
   * Repeat toggle button - toggles repeat mode on the AudioPlayer
   * ------------------------------------------------------------------ */
  const repeatBtn = createSecondaryButton(PLAYER_ICONS.repeat, () => {});
  attachRepeatToggle(repeatBtn, audioPlayer);

  // Assemble container
  container.appendChild(restartBtn);
  container.appendChild(playBtn);
  container.appendChild(repeatBtn);

  return { element: container, updatePlayButton };
}
