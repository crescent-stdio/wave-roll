import { AppState, StateManagerConfig } from "./types";
import { UIState } from "./types";
import { PlaybackState } from "./types";
import { FileVisibilityState } from "./types";
import { LoopPointsState } from "./types";
import { PanVolumeState } from "./types";
import { VisualState } from "./types";

export const DEFAULT_STATE_CONFIG: StateManagerConfig = {
  defaultVolume: 0.7,
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
};

export const DEFAULT_VISUAL_STATE: VisualState = {
  currentNoteColors: [],
  zoomLevel: DEFAULT_STATE_CONFIG.defaultZoomLevel,
  highlightMode: "file",
};

export const DEFAULT_APP_STATE: AppState = {
  ui: DEFAULT_UI_STATE,
  playback: DEFAULT_PLAYBACK_STATE,
  fileVisibility: DEFAULT_FILE_VISIBILITY_STATE,
  loopPoints: DEFAULT_LOOP_POINTS_STATE,
  panVolume: DEFAULT_PAN_VOLUME_STATE,
  visual: DEFAULT_VISUAL_STATE,
};
