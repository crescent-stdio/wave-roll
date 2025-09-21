// Export missing APIs required by public HTML demos

// 1) Piano-roll visualizer factory (fully functional implementation)
export { createPianoRoll } from "./lib/core/visualization/piano-roll";

// 2) Player demo helper used by the synchronized-player example
export { createWaveRollPlayer } from "./lib/components/player/wave-roll/player";

// 3) Evaluation helpers
export {
  computeNoteMetrics,
  DEFAULT_TOLERANCES,
} from "./lib/evaluation/transcription";

// 4) Register Web Component
import "./web-component";
export { WaveRollElement } from "./web-component";
