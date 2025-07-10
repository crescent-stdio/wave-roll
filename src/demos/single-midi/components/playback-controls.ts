import { PLAYER_ICONS } from "@/assets/player-icons";
import { COLOR_PRIMARY } from "@/core/constants";
import { AudioPlayerControls } from "@/core/audio/audio-player";

/**
 * Create main playback control buttons
 *
 * @param audioPlayer - AudioPlayerControls instance
 * @returns HTMLElement containing playback controls
 */
export function createPlaybackControls(
  audioPlayer: AudioPlayerControls
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
    z-index: 10; /* ensure above any overlay from seek bar */
  `;

  // Play/Pause button - Primary action, larger
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

  // Function to update play button state and behavior
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
          console.error("Failed to play:", error);
          alert(
            `Failed to start playback: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      };
    }
  };

  // Play button hover effects
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

  // Set initial state
  updatePlayButton();

  // Secondary buttons with flat design
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

  // Restart button
  const restartBtn = createSecondaryButton(PLAYER_ICONS.restart, () => {
    // Always restart from 0s, regardless of A-B loop settings
    audioPlayer?.seek(0);
    if (!audioPlayer?.getState().isPlaying) {
      audioPlayer?.play();
    }
    updatePlayButton();
  });

  // Repeat toggle
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

  container.appendChild(restartBtn);
  container.appendChild(playBtn);
  container.appendChild(repeatBtn);

  // Store updatePlayButton for use in update loop
  (audioPlayer as any).updatePlayButton = updatePlayButton;

  return container;
}
