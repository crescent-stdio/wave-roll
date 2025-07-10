import { AudioPlayerContainer } from "@/core/audio";
import { AudioController } from "@/demos/multi-midi/components/audio-controller";
import { VisualizationEngine } from "@/demos/multi-midi/components/visualization-engine";
import { MultiMidiManager } from "@/lib/core/midi/multi-midi-manager";

/**
 * Minimal subset of methods required from both core PianoRoll and demo PianoRoll
 */
export interface PianoRollLike {
  getState?: () => { zoomX: number };
  zoomX?: (factor: number) => void;
  resetView?: () => void;
  setLoopWindow?: (start: number | null, end: number | null) => void;
  setTimeStep?: (step: number) => void;
  getTimeStep?: () => number;
  setMinorTimeStep?: (step: number) => void;
  getMinorTimeStep?: () => number;

  /** Resize renderer when container size changes */
  resize?: (width: number, height?: number) => void;
}

/**
 * Narrow player interface shared by AudioPlayerControls and VisualizationEngine.
 * Contains only the APIs actually consumed by UI controls.
 */
// export interface AudioPlayerLike {
//   play(): Promise<void>;
//   pause(): void;
//   seek(seconds: number, updateVisual?: boolean): void;
//   setVolume(volume: number): void;
//   setTempo(bpm: number): void;
//   setPan(pan: number): void;
//   toggleRepeat(enabled: boolean): void;
//   setLoopPoints(start: number | null, end: number | null): void;
//   getState(): {
//     isPlaying: boolean;
//     currentTime: number;
//     /** Total duration of the current audio buffer (seconds) */
//     duration: number;
//     tempo: number;
//     volume: number;
//     isRepeating: boolean;
//     pan: number;
//   };
// }

export interface UIComponentDependencies {
  midiManager: MultiMidiManager;
  /** Object exposing playback controls (AudioController or VisualizationEngine). */
  audioPlayer: AudioController | VisualizationEngine | null;
  pianoRoll: PianoRollLike | null;

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
