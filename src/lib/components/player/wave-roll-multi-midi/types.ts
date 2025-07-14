import { AudioControllerConfig, PianoRollConfig } from "@/core/playback";

export interface WaveRollMultiMidiPlayerOptions {
  /** Configuration for the underlying AudioController */
  audioController: Partial<AudioControllerConfig>;
  /** Default settings for the piano-roll visualisation */
  pianoRoll: Partial<PianoRollConfig>;
  /** UI-specific layout configuration */
  ui: {
    sidebarWidth: number;
    minHeight: number;
    updateInterval: number;
  };
}
