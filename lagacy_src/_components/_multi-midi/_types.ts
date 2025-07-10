/**
 * Interfaces shared by Multi-MIDI UI modules.
 * These were moved from the original `UIComponents.ts` monolith.
 */

export interface UIComponentDependencies {
  midiManager: any;
  audioPlayer: any;
  pianoRollInstance: any;

  filePanStateHandlers: Record<string, (pan: number | null) => void>;
  filePanValues: Record<string, number>;

  /** When true, overall mute is engaged because L/R channels are missing. */
  muteDueNoLR: boolean;
  /** Last non-zero volume before the 'muteDueNoLR' auto-mute kicked in. */
  lastVolumeBeforeMute: number;

  /** Minor grid step (seconds) that should match piano-roll rendering. */
  minorTimeStep: number;

  /** Current A / B loop points (seconds). */
  loopPoints: { a: number | null; b: number | null } | null;

  /** True while the user is dragging the seek bar. */
  seeking: boolean;

  /**
   * Callback used by visualisation engine to update the seek bar.
   * Accepts an optional override payload when the caller has its own time values.
   */
  updateSeekBar:
    | ((state?: { currentTime: number; duration: number }) => void)
    | null;

  /** Callback that toggles play ↔ pause icon. */
  updatePlayButton: (() => void) | null;

  /** Callback to reflect global mute state changes. */
  updateMuteState: (shouldMute: boolean) => void;

  /** Opens the zoom / grid settings modal. */
  openSettingsModal: () => void;

  /** Utility to format seconds as `MM:SS`. */
  formatTime: (seconds: number) => string;
}

export interface UIElements {
  mainContainer: HTMLElement;
  sidebarContainer: HTMLElement;
  playerContainer: HTMLElement;
  controlsContainer: HTMLElement;
  timeDisplay: HTMLElement;

  // Optional / lazily injected elements
  progressBar: HTMLElement | null;
  seekHandle: HTMLElement | null;
  currentTimeLabel: HTMLElement | null;
  totalTimeLabel: HTMLElement | null;
  seekBarContainer: HTMLElement | null;
  loopRegion: HTMLElement | null;
  markerA: HTMLElement | null;
  markerB: HTMLElement | null;
  progressIndicator: HTMLElement | null;
  markerATimeLabel: HTMLElement | null;
  markerBTimeLabel: HTMLElement | null;
  zoomInput: HTMLInputElement | null;
  fileToggleContainer: HTMLElement | null;
}
