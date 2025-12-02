import { PLAYER_ICONS } from "@/assets/player-icons";
import { COLOR_PRIMARY } from "@/lib/core/constants";
import { attachHoverBackground } from "@/core/controls/utils/hover-background";
import { attachButtonScale } from "@/core/controls/utils/button-scale";
import { setupPlayButton } from "@/core/controls/utils/play-button";
import { attachRepeatToggle } from "@/core/controls/utils/repeat-toggle";
import { createIconButton } from "../utils/icon-button";
import { UIComponentDependencies } from "../types";
import { ensureAudioContextReady } from "@/lib/core/audio/utils/audio-context";
// Removed MasterVolumeControl - global volume is managed by createVolumeControlUI

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
    background: var(--panel-bg);
    color: var(--text-primary);
    padding: 4px 8px;
    border-radius: 8px;
    position: relative;
    z-index: 10;
    box-shadow: var(--shadow-sm);
  `;

  /* ---------------- play / pause ---------------- */
  const playBtn = document.createElement("button");
  playBtn.innerHTML = PLAYER_ICONS.play;
  playBtn.style.cssText = `
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: var(--accent-strong);
    color: var(--on-accent);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    position: relative;
  `;
  playBtn.classList.add("wr-focusable");

  const waitUntil = async (predicate: () => boolean, timeoutMs = 2000, intervalMs = 50) => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeoutMs) break;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };

  const updatePlayButton = setupPlayButton({
    playBtn,
    audioPlayer: dependencies.audioPlayer,
    prePlay: async () => {
      // 1) Start/resume AudioContext immediately on user gesture
      try { await ensureAudioContextReady(); } catch {}
      // 2) Ensure underlying audio player exists before calling play()
      await waitUntil(() => !!dependencies.audioPlayer?.isInitialized?.());
    },
    postPlay: () => dependencies.updateSeekBar?.(),
  });

  // Apply scale effects and initial sync
  attachButtonScale(playBtn);
  updatePlayButton();

  dependencies.updatePlayButton = updatePlayButton;

  // Disable play until the underlying audio player is fully initialized
  const setPlayEnabled = (enabled: boolean) => {
    (playBtn as HTMLButtonElement).disabled = !enabled;
    playBtn.style.opacity = enabled ? "1" : "0.6";
    playBtn.style.cursor = enabled ? "pointer" : "default";
  };
  const isReady = () => {
    try {
      return !!dependencies.audioPlayer?.isInitialized?.();
    } catch {
      return false;
    }
  };
  // Initial state
  setPlayEnabled(isReady());
  // Poll briefly until ready (fast settle once files parsed)
  let readyCheckId: number | null = null;
  if (!isReady()) {
    readyCheckId = window.setInterval(() => {
      if (isReady()) {
        setPlayEnabled(true);
        // sync icon state once enabled
        updatePlayButton();
        if (readyCheckId) {
          clearInterval(readyCheckId);
          readyCheckId = null;
        }
      }
    }, 100);
  }

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
