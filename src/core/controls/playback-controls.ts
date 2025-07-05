import { AudioPlayerControls } from "../../AudioPlayer";
import { PLAYER_ICONS } from "../../assets/player-icons";
import { COLOR_PRIMARY } from "../constants";

export interface PlaybackControlsResult {
  element: HTMLElement;
  updatePlayButton: () => void;
}

/**
 * Create playback control elements (restart, play/pause, repeat) and return
 * both the HTMLElement container and an updatePlayButton function that keeps
 * the play/pause button UI in sync with current playback state.
 */
export function createPlaybackControls(
  audioPlayer: AudioPlayerControls | null
): PlaybackControlsResult {
  // Container for playback buttons
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

  /**
   * Sync the play/pause button to current player state and attach
   * appropriate click handler.
   */
  const updatePlayButton = () => {
    const state = audioPlayer?.getState();
    if (state?.isPlaying) {
      playBtn.innerHTML = PLAYER_ICONS.pause;
      playBtn.style.background = "#28a745";
      playBtn.onclick = () => {
        audioPlayer?.pause();
        updatePlayButton();
      };
    } else {
      playBtn.innerHTML = PLAYER_ICONS.play;
      playBtn.style.background = COLOR_PRIMARY;
      playBtn.onclick = async () => {
        try {
          await audioPlayer?.play();
          updatePlayButton();
        } catch (error) {
          /* eslint-disable no-console */
          console.error("Failed to play:", error);
          alert(
            `Failed to start playback: ${error instanceof Error ? error.message : "Unknown error"}`
          );
          /* eslint-enable no-console */
        }
      };
    }
  };

  // Hover effects
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

    btn.addEventListener("mouseenter", () => {
      if (!btn.dataset.active) {
        btn.style.background = "rgba(0, 0, 0, 0.05)";
      }
    });
    btn.addEventListener("mouseleave", () => {
      if (!btn.dataset.active) {
        btn.style.background = "transparent";
      }
    });

    return btn;
  };

  /* ------------------------------------------------------------------
   * Restart button – seeks to 0 and auto-plays if not already playing
   * ------------------------------------------------------------------ */
  const restartBtn = createSecondaryButton(PLAYER_ICONS.restart, () => {
    audioPlayer?.seek(0);
    if (!audioPlayer?.getState().isPlaying) {
      audioPlayer?.play();
    }
    updatePlayButton();
  });

  /* ------------------------------------------------------------------
   * Repeat toggle button – toggles repeat mode on the AudioPlayer
   * ------------------------------------------------------------------ */
  const repeatBtn = createSecondaryButton(PLAYER_ICONS.repeat, () => {
    const state = audioPlayer?.getState();
    const newRepeat = !state?.isRepeating;
    audioPlayer?.toggleRepeat(newRepeat);

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

  // Assemble container
  container.appendChild(restartBtn);
  container.appendChild(playBtn);
  container.appendChild(repeatBtn);

  return { element: container, updatePlayButton };
}
