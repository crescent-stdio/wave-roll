import { AppState, StateManagerConfig } from "./types";
import { UIState } from "./types";
import { PlaybackState } from "./types";
import { FileVisibilityState } from "./types";
import { LoopPointsState } from "./types";
import { PanVolumeState } from "./types";
import { VisualState } from "./types";
import type { OnsetMarkerStyle } from "@/types";
import { EvaluationState } from "./types";

export const DEFAULT_STATE_CONFIG: StateManagerConfig = {
  defaultVolume: 1.0,
  defaultMinorTimeStep: 0.1,
  defaultZoomLevel: 1.0,
  updateInterval: 50, // 50ms update interval
};

export const DEFAULT_UI_STATE: UIState = {
  seeking: false,
  isBatchLoading: false,
  updateLoopId: null,
  muteDueNoLR: false,
  lastVolumeBeforeMute: DEFAULT_STATE_CONFIG.defaultVolume,
  minorTimeStep: DEFAULT_STATE_CONFIG.defaultMinorTimeStep,
};

export const DEFAULT_PLAYBACK_STATE: PlaybackState = {
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  volume: DEFAULT_STATE_CONFIG.defaultVolume,
  playbackGeneration: 0,
  nowTime: 0,
  masterVolume: DEFAULT_STATE_CONFIG.defaultVolume,
  tempo: 120,
  loopMode: "off",
  markerA: null,
  markerB: null,
};

export const DEFAULT_FILE_VISIBILITY_STATE: FileVisibilityState = {
  visibleFileIds: new Set(),
  totalFiles: 0,
};

export const DEFAULT_LOOP_POINTS_STATE: LoopPointsState = {
  a: null,
  b: null,
};

export const DEFAULT_PAN_VOLUME_STATE: PanVolumeState = {
  filePanValues: {},
  filePanStateHandlers: {},
  fileMuteStates: {},
};

export const DEFAULT_VISUAL_STATE: VisualState = {
  currentNoteColors: [],
  zoomLevel: DEFAULT_STATE_CONFIG.defaultZoomLevel,
  highlightMode: "eval-tp-only-gray",
  minOffsetTolerance: 0.05,
  pedalElongate: true,
  pedalThreshold: 64,
  showOnsetMarkers: true,
  fileOnsetMarkers: {},
};

export const DEFAULT_EVALUATION_STATE: EvaluationState = {
  refId: null,
  estIds: [],
  onsetTolerance: 0.05,
  pitchTolerance: 0.5,
  offsetRatioTolerance: 0.2,
  offsetMinTolerance: 0.05,
  anchor: "intersection",
  showLoopOnlyMetrics: false,
  refOnTop: false,
};

export const DEFAULT_APP_STATE: AppState = {
  ui: DEFAULT_UI_STATE,
  playback: DEFAULT_PLAYBACK_STATE,
  fileVisibility: DEFAULT_FILE_VISIBILITY_STATE,
  loopPoints: DEFAULT_LOOP_POINTS_STATE,
  panVolume: DEFAULT_PAN_VOLUME_STATE,
  visual: DEFAULT_VISUAL_STATE,
  evaluation: DEFAULT_EVALUATION_STATE,
};
