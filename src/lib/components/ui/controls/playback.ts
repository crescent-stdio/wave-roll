import { PLAYER_ICONS } from "@/assets/player-icons";
import { COLOR_PRIMARY } from "@/lib/core/constants";
import { attachHoverBackground } from "@/core/controls/utils/hover-background";
import { attachButtonScale } from "@/core/controls/utils/button-scale";
import { setupPlayButton } from "@/core/controls/utils/play-button";
import { attachRepeatToggle } from "@/core/controls/utils/repeat-toggle";
import { createIconButton } from "../utils/icon-button";
import { UIComponentDependencies } from "../types";
import { ensureAudioContextReady } from "@/lib/core/audio/utils/audio-context";
import { attachTooltip } from "../utils/tooltip";
// Removed MasterVolumeControl - global volume is managed by createVolumeControlUI

/**
 * Create a playback control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The playback control element.
 */
export function createPlaybackControlsUI(dependencies: UIComponentDependencies): HTMLElement {
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
  playBtn.setAttribute("aria-label", "Play (Space)");

  // Track play state for tooltip
  let isPlaying = false;
  attachTooltip(playBtn, {
    getText: () => (isPlaying ? "Pause (Space)" : "Play (Space)"),
  });

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
      try {
        await ensureAudioContextReady();
      } catch {}
      // 2) Ensure underlying audio player exists before calling play()
      await waitUntil(() => !!dependencies.audioPlayer?.isInitialized?.());
    },
    postPlay: () => {
      dependencies.updateSeekBar?.();
      // Update play state for tooltip
      isPlaying = dependencies.audioPlayer?.getState().isPlaying ?? false;
      playBtn.setAttribute("aria-label", isPlaying ? "Pause (Space)" : "Play (Space)");
    },
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
    isPlaying = dependencies.audioPlayer?.getState().isPlaying ?? false;
  });
  restartBtn.setAttribute("aria-label", "Restart");
  attachHoverBackground(restartBtn);
  attachTooltip(restartBtn, "Restart");

  /* repeat toggle */
  let isRepeating = dependencies.audioPlayer?.getState()?.isRepeating ?? false;
  const repeatBtn = createIconButton(PLAYER_ICONS.repeat, () => {});
  attachRepeatToggle(repeatBtn, dependencies.audioPlayer);
  attachHoverBackground(repeatBtn);
  repeatBtn.setAttribute("aria-label", "Loop");
  attachTooltip(repeatBtn, {
    getText: () => (isRepeating ? "Loop: On" : "Loop: Off"),
  });

  // Track repeat state changes
  const originalOnClick = repeatBtn.onclick;
  repeatBtn.onclick = (e) => {
    if (originalOnClick) {
      originalOnClick.call(repeatBtn, e);
    }
    isRepeating = dependencies.audioPlayer?.getState()?.isRepeating ?? false;
    repeatBtn.setAttribute("aria-label", isRepeating ? "Loop: On" : "Loop: Off");
  };

  container.appendChild(restartBtn);
  container.appendChild(playBtn);
  container.appendChild(repeatBtn);

  return container;
}
