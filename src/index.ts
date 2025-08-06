// ------------------------------------------------------------------
// Export missing APIs required by public HTML demos
// ------------------------------------------------------------------

// 1) Piano-roll visualizer factory (fully functional implementation)
export { createPianoRoll } from "@/lib/core/visualization/piano-roll";

// 2) Player demo helper used by the synchronized-player example
export { createWaveRollPlayer } from "@/lib/components/player/wave-roll/player";

// 3) Evaluation helpers
export {
  computeNoteMetrics,
  DEFAULT_TOLERANCES,
} from "@/lib/evaluation/transcription";

// ------------------------------------------------------------------
// 3) Deprecated html-midi-player stubs
// ------------------------------------------------------------------

/**
 * Options accepted by the legacy <html-midi-player/> wrapper.
 * These are kept only so that older code can still compile.
 * They have no effect in the stub implementation below.
 */
export interface MidiPlayerOptions {
  showVisualizer?: boolean;
  soundFont?: boolean | string;
  className?: string;
  width?: string;
  height?: string;
}

/**
 * Stubbed loader for html-midi-player Web Components.
 */
export async function loadPlayerComponents(): Promise<void> {
  /* html-midi-player components were removed - nothing to load */
  return;
}

/**
 * Legacy runtime check - always returns false because the old player was removed.
 */
export function isPlayerAvailable(): boolean {
  return false;
}

/**
 * Stub that used to return internal player state - now returns an empty object.
 */
export function debugPlayerState(
  _container?: HTMLElement
): Record<string, never> {
  return {} as const;
}
