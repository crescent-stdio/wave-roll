/**
 * Playback module exports
 *
 * Unified playback engine combining audio and visualization
 */

export {
  CorePlaybackEngine,
  createCorePlaybackEngine,
  type CorePlaybackEngineConfig,
  type VisualUpdateParams,
} from "./core-playback-engine";

export {
  PianoRollManager,
  createPianoRollManager,
  type PianoRollConfig,
  type ColoredNote,
  type PianoRollInstance,
  DEFAULT_PIANO_ROLL_CONFIG,
} from "./piano-roll-manager";

export {
  AudioController,
  createAudioController,
  type AudioControllerConfig,
  type AudioPlayerState,
  type LoopPoints,
} from "./audio-controller";
