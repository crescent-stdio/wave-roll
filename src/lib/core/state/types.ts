/**
 * UI state for player controls and interface elements
 */
export interface UIState {
  seeking: boolean;
  isBatchLoading: boolean;
  updateLoopId: number | null;
  muteDueNoLR: boolean;
  lastVolumeBeforeMute: number;
  minorTimeStep: number;
}

/**
 * Playback state for audio player and timing
 */
export interface PlaybackState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
}

/**
 * File visibility state for managing which MIDI files are shown
 */
// TODO: move to file-manager.ts
export interface FileVisibilityState {
  visibleFileIds: Set<string>;
  totalFiles: number;
}

/**
 * Loop points state for A-B loop functionality
 */
// TODO: move to audio-player.ts
export interface LoopPointsState {
  a: number | null;
  b: number | null;
}

/**
 * Pan and volume state for individual files
 */
// TODO: move to
export interface PanVolumeState {
  filePanValues: Record<string, number>;
  filePanStateHandlers: Record<string, (pan: number | null) => void>;
}

/**
 * Visual state for piano roll and note rendering
 */
export type HighlightMode =
  | "file"
  | "highlight-simple"
  | "highlight-blend"
  | "highlight-exclusive"
  | "eval-match-intersection-gray"
  | "eval-match-intersection-own"
  | "eval-exclusive-intersection-gray"
  | "eval-exclusive-intersection-own"
  | "eval-gt-missed-only";

export interface VisualState {
  currentNoteColors: number[];
  zoomLevel: number;
  /** Current note highlight mode for overlap visualisation */
  highlightMode: HighlightMode;
  /** Minimum offset tolerance for visual/overlay purposes (Zoom/Grid settings) */
  minOffsetTolerance: number;
  /** Whether to apply sustain pedal elongation when parsing MIDI */
  pedalElongate: boolean;
  /** Threshold for sustain pedal detection (0-127, default 64) */
  pedalThreshold: number;
}

/**
 * Evaluation state for transcription evaluation
 */
export interface EvaluationState {
  refId: string | null;
  estIds: string[];
  onsetTolerance: number;
  pitchTolerance: number;
  offsetRatioTolerance: number;
  offsetMinTolerance: number;
  anchor: "intersection" | "ref" | "est";
  kOfN: number;
  showLoopOnlyMetrics: boolean;
  /** When true, render the reference file notes above all others */
  refOnTop: boolean;
}

/**
 * Complete application state
 */
export interface AppState {
  ui: UIState;
  playback: PlaybackState;
  fileVisibility: FileVisibilityState;
  loopPoints: LoopPointsState;
  panVolume: PanVolumeState;
  visual: VisualState;
  evaluation: EvaluationState;
}

/**
 * Configuration for state manager
 */
export interface StateManagerConfig {
  defaultVolume: number;
  defaultMinorTimeStep: number;
  defaultZoomLevel: number;
  updateInterval: number;
}
