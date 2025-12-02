import { PianoRollInstance } from "@/core/visualization/piano-roll";
import { VisualizationEngine } from "@/core/visualization";
import { MultiMidiManager } from "@/lib/core/midi/multi-midi-manager";
import { StateManager } from "@/core/state";
import { SilenceDetector } from "@/core/playback/silence-detector";
import { MidiExportOptions } from "@/lib/components/player/wave-roll/types";

export interface UIComponentDependencies {
  midiManager: MultiMidiManager;
  /** Active visualization engine exposing playback controls. */
  audioPlayer: VisualizationEngine | null;
  pianoRoll: PianoRollInstance | null;

  /** Global application state manager */
  stateManager: StateManager;

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
  updateSeekBar: ((state?: { currentTime: number; duration: number }) => void) | null;

  /** Callback that toggles play ↔ pause icon. */
  updatePlayButton: (() => void) | null;

  /** Callback to reflect global mute state changes. */
  updateMuteState: (shouldMute: boolean) => void;

  /** Opens the zoom / grid settings modal. */
  openSettingsModal: () => void;
  /** Opens the evaluation results modal. */
  openEvaluationResultsModal: () => void;

  /** Utility to format seconds as `MM:SS`. */
  formatTime: (seconds: number) => string;

  /** Silence detector for auto-pause when all sources are muted/silent */
  silenceDetector: SilenceDetector | null;

  /** Optional reference to zoom input for synchronized UI updates */
  zoomInput?: HTMLInputElement;

  /** Optional permissions controlling UI capabilities (e.g., readonly mode) */
  permissions?: {
    /** When false, hide and disable UI paths that add files */
    canAddFiles: boolean;
    /** When false, hide and disable UI paths that remove files */
    canRemoveFiles: boolean;
  };

  /** Optional UI options */
  uiOptions?: {
    /** Toast tooltip options for highlight mode */
    highlightToast?: {
      /** Position: e.g., 'bottom', 'top' */
      position?: 'bottom' | 'top';
      /** Milliseconds to keep the toast visible */
      durationMs?: number;
      /** Inline CSS to override the toast container style */
      style?: Partial<CSSStyleDeclaration>;
    };
  };

  /** Solo mode: hides evaluation UI, file sections, and waveform band */
  soloMode?: boolean;

  /** MIDI export options (mode and custom handler) */
  midiExport?: MidiExportOptions;
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
