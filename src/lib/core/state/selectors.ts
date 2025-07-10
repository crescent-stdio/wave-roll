import { AppState } from "./types";
import { clamp } from "../utils";

export const clampTimeToDuration = (s: AppState, t: number) => {
  const dur = s.playback.duration;
  return clamp(t, 0, dur);
};

export const selectUI = (s: AppState) => s.ui;
export const selectPlayback = (s: AppState) => s.playback;
export const selectVolume = (s: AppState) => s.playback.volume;

export const selectVisibleFileIds = (s: AppState) =>
  s.fileVisibility.visibleFileIds;
export const selectTotalFiles = (s: AppState) => s.fileVisibility.totalFiles;

export const selectLoopPoints = (s: AppState) => s.loopPoints;
export const selectFileVisibility = (s: AppState) => s.fileVisibility;
export const selectPanVolume = (s: AppState) => s.panVolume;
export const selectVisual = (s: AppState) => s.visual;
export const selectZoomLevel = (s: AppState) => s.visual.zoomLevel;
export const selectCurrentNoteColors = (s: AppState) =>
  s.visual.currentNoteColors;
export const selectLoopPercentages = (s: AppState) => {
  const { a, b } = s.loopPoints;
  const dur = s.playback.duration || 1;
  return {
    a: a !== null ? (a / dur) * 100 : null,
    b: b !== null ? (b / dur) * 100 : null,
  };
};

export const selectIsBatchLoading = (s: AppState) => s.ui.isBatchLoading;
export const selectIsSeeking = (s: AppState) => s.ui.seeking;

export const selectHasVisibleFiles = (s: AppState) =>
  s.fileVisibility.visibleFileIds.size > 0;
export const selectHasLoopPoints = (s: AppState) =>
  s.loopPoints.a !== null || s.loopPoints.b !== null;
