// Export missing APIs required by public HTML demos

// 1) Piano-roll visualizer factory (fully functional implementation)
export { createPianoRoll } from "./lib/core/visualization/piano-roll";

// 2) Player demo helper used by the synchronized-player example
export { createWaveRollPlayer } from "./lib/components/player/wave-roll/player";

// 3) Appearance settings types (for solo mode integration)
export type { AppearanceSettings } from "./lib/components/player/wave-roll/player";
export type { ColorPalette } from "./lib/core/midi/types";
export type { OnsetMarkerStyle, OnsetMarkerShape } from "./lib/types";
export { DEFAULT_PALETTES } from "./lib/core/midi/palette";
export { ONSET_MARKER_SHAPES } from "./lib/core/constants";

// 4) Evaluation helpers
export {
  computeNoteMetrics,
  DEFAULT_TOLERANCES,
} from "./lib/evaluation/transcription";

// 5) Register Web Component
import "./web-component";
export { WaveRollElement } from "./web-component";
