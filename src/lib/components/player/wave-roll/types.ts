import { AudioControllerConfig, PianoRollConfig } from "@/core/playback";

export interface WaveRollPlayerOptions {
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

/** Options for createWaveRollPlayer factory function */
export interface CreateWaveRollPlayerOptions {
  /** Solo mode: hides evaluation UI, file sections, and waveform band */
  soloMode?: boolean;
  /** Override piano roll config */
  pianoRoll?: Partial<PianoRollConfig>;
}
