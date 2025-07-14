import type { AnyAudioPlayer } from "./play-button";
import { COLOR_PRIMARY } from "@/lib/core/constants";

/**
 * Attach repeat-toggle behaviour and visual state handling to a button.
 * Expects the button to already have hover background behaviour attached.
 */
export function attachRepeatToggle(
  btn: HTMLElement,
  audioPlayer: AnyAudioPlayer | null | undefined,
  colorPrimary: string = COLOR_PRIMARY
): void {
  if (!btn) return;
  const updateVisual = (enabled: boolean) => {
    if (enabled) {
      btn.dataset.active = "true";
      btn.style.background = "rgba(0, 123, 255, 0.1)";
      btn.style.color = colorPrimary;
    } else {
      delete btn.dataset.active;
      btn.style.background = "transparent";
      btn.style.color = "#495057";
    }
  };

  btn.onclick = () => {
    const state = audioPlayer?.getState();
    const newRepeat = !state?.isRepeating;
    audioPlayer?.toggleRepeat(newRepeat);
    updateVisual(newRepeat);
  };

  // initial sync
  updateVisual(!!audioPlayer?.getState()?.isRepeating);
}
