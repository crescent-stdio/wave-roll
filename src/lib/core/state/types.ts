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
export interface VisualState {
  currentNoteColors: number[];
  zoomLevel: number;
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
