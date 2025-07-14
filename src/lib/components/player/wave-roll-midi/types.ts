import type { PianoRollConfig } from "@/lib/core/visualization/piano-roll/types";
import type { PlayerOptions } from "@/lib/core/audio/audio-player";

export interface WaveRollMidiPlayerOptions {
  pianoRoll?: PianoRollConfig;
  player?: PlayerOptions;
  /** Hide volume slider if `false` */
  showVolumeControl?: boolean;
  /** Hide tempo input if `false` */
  showTempoControl?: boolean;
  /** Hide zoom reset button if `false` */
  showZoomControl?: boolean;
  /** Hide settings modal trigger if `false` */
  showSettingsControl?: boolean;
}
