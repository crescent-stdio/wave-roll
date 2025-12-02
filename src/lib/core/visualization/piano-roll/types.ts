import { NoteInterval } from "@/core/controls/utils/overlap";
import type { PianoRoll } from "./piano-roll";
import { NoteData, ControlChangeEvent } from "@/lib/midi/types";
export type { NoteData } from "@/lib/midi/types";

/**
 * Configuration options for the piano roll
 */
export interface PianoRollConfig {
  /** Container width in pixels */
  width?: number;
  /** Container height in pixels */
  height?: number;
  /** Background color as hex number */
  backgroundColor?: number;
  /** Per-file note color as hex number */
  fileNoteColor?: number;
  /** Note color as hex number */
  noteColor?: number;
  /** Current playback position color */
  playheadColor?: number;
  /** Whether to show piano key labels on the left */
  showPianoKeys?: boolean;
  /** MIDI note range to display */
  noteRange?: { min: number; max: number };
  /** Time step for grid lines */
  timeStep?: number;
  /** Minor grid step (seconds) for lighter subdivision lines */
  minorTimeStep?: number;
  /** Custom note renderer function to determine color per note */
  noteRenderer?: (note: NoteData, index: number) => number;
  /** Whether to show waveform band at the bottom (default: true) */
  showWaveformBand?: boolean;
  /** Preferred renderer type for PixiJS (default: auto-select) */
  rendererPreference?: 'webgl' | 'webgpu';
}

/**
 * Piano roll component state
 */
export interface PianoRollViewState {
  /** Current zoom level on X axis (time) */
  zoomX: number;
  /** Current zoom level on Y axis (pitch) */
  zoomY: number;
  /** Pan offset on X axis (time) */
  panX: number;
  /** Pan offset on Y axis (pitch) - FIXED at 0 */
  panY: number;
  /** Current playback time in seconds */
  currentTime: number;
  /** Whether panning is active */
  isPanning: boolean;
  /** Last mouse/touch position for panning */
  lastPointerPos: { x: number; y: number };
}

export type PianoRollInstance = {
  setNotes: (newNotes: NoteData[]) => void;
  setTime: (time: number) => void;
  zoomX: (factor: number) => void;
  zoomY: (factor: number) => void;
  pan: (deltaX: number, deltaY: number) => void;
  resetView: () => void;
  getState: () => PianoRollViewState;
  destroy: () => void;
  setTimeStep: (step: number) => void;
  getTimeStep: () => number;
  setLoopWindow?: (start: number | null, end: number | null) => void;
  onTimeChange: (callback: (time: number) => void) => void;
  setMinorTimeStep: (step: number) => void;
  getMinorTimeStep: () => number;

  /** Update the set of Control Change events (e.g., sustain pedal) */
  setControlChanges?: (controlChanges: ControlChangeEvent[]) => void;

  setOverlapRegions?: (overlaps: NoteInterval[]) => void;

  /** Resize the visualizer to a new width/height */
  resize: (width: number, height?: number) => void;
  
  /** Internal reference to the PianoRoll instance */
  _instance?: PianoRoll;
};
