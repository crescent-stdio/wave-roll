import { PLAYER_ICONS } from "@/assets/player-icons";
import { COLOR_PRIMARY } from "@/lib/core/constants";
import type { AudioPlayerContainer } from "@/lib/core/audio/audio-player";
import type { AudioController } from "@/core/playback";
import type { VisualizationEngine } from "@/core/visualization/visualization-engine";

export type AnyAudioPlayer =
  | AudioPlayerContainer
  | AudioController
  | VisualizationEngine;

export interface SetupPlayButtonOptions {
  playBtn: HTMLElement;
  audioPlayer: AnyAudioPlayer | null | undefined;
  /**
   * Optional WavPlayerManager for buffer status checking
   */
  wavPlayerManager?: { areAllBuffersReady(): boolean } | null;
  /**
   * Executed before attempting audioPlayer.play(). Useful for Tone.start() etc.
   */
  prePlay?: () => Promise<void> | void;
  /**
   * Executed after a successful play() call.
   */
  postPlay?: () => void;
  /**
   * Executed after a pause() call.
   */
  postPause?: () => void;
  /**
   * Optional colors
   */
  playingColor?: string;
  idleColor?: string;
}

/**
 * Attach play / pause behaviour to a button element and return an
 * `updatePlayButton` function that syncs the UI with current player state.
 */
export function setupPlayButton(opts: SetupPlayButtonOptions): () => void {
  const {
    playBtn,
    audioPlayer,
    wavPlayerManager,
    prePlay,
    postPlay,
    postPause,
    playingColor = "#28a745",
    idleColor = COLOR_PRIMARY,
  } = opts;

  const updatePlayButton = () => {
    const state = audioPlayer?.getState();
    const isPlaying = !!state?.isPlaying;
    const buffersReady = wavPlayerManager ? wavPlayerManager.areAllBuffersReady() : true;

    if (isPlaying) {
      playBtn.innerHTML = PLAYER_ICONS.pause;
      playBtn.style.background = playingColor;
      playBtn.style.opacity = "1";
      playBtn.style.cursor = "pointer";
      (playBtn as HTMLButtonElement).disabled = false;
      playBtn.onclick = () => {
        audioPlayer?.pause();
        postPause?.();
        updatePlayButton();
      };
    } else {
      playBtn.innerHTML = buffersReady ? PLAYER_ICONS.play : "⏳";
      playBtn.style.background = buffersReady ? idleColor : "#999999";
      playBtn.style.opacity = buffersReady ? "1" : "0.6";
      playBtn.style.cursor = buffersReady ? "pointer" : "not-allowed";
      (playBtn as HTMLButtonElement).disabled = !buffersReady;
      
      if (buffersReady) {
        playBtn.onclick = async () => {
          try {
            await prePlay?.();
          } catch (e) {
            /* eslint-disable no-console */
            console.warn("[setupPlayButton] prePlay() failed", e);
            /* eslint-enable no-console */
          }
          try {
            await audioPlayer?.play();
            postPlay?.();
            updatePlayButton();
          } catch (error) {
            /* eslint-disable no-console */
            console.error("Failed to play:", error);
            alert(
              `Failed to start playback: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
            /* eslint-enable no-console */
          }
        };
      } else {
        playBtn.onclick = () => {
          console.log("[setupPlayButton] Audio buffers are not ready yet. Please wait...");
          // Optional: Show a toast or notification to user
        };
      }
    }
  };

  return updatePlayButton;
}
