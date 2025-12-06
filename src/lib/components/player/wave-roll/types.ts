import { AudioControllerConfig, PianoRollConfig } from "@/core/playback";
import { HighlightMode } from "@/core/state/types";

export interface WaveRollPlayerOptions {
  /** Configuration for the underlying AudioController */
  audioController: Partial<AudioControllerConfig>;
  /** Default settings for the piano-roll visualisation */
  pianoRoll: Partial<PianoRollConfig>;
  /** UI-specific layout configuration */
  ui: {
    sidebarWidth: number;
    minHeight: number;
    updateInterval: number;
  };
}

/**
 * Options for MIDI export behavior.
 */
export interface MidiExportOptions {
  /**
   * Export mode:
   * - 'download': Default browser download (current behavior)
   * - 'saveAs': Use File System Access API to let user choose location
   * - 'custom': Use a custom handler provided via onExport
   */
  mode?: "download" | "saveAs" | "custom";
  /**
   * Custom export handler (used when mode is 'custom').
   * Receives the MIDI blob and suggested filename.
   * @param blob - The MIDI file as a Blob
   * @param filename - Suggested filename for the export
   */
  onExport?: (blob: Blob, filename: string) => Promise<void>;
}

/** Options for createWaveRollPlayer factory function */
export interface CreateWaveRollPlayerOptions {
  /** Solo mode: hides evaluation UI, file sections, and waveform band */
  soloMode?: boolean;
  /** Override piano roll config */
  pianoRoll?: Partial<PianoRollConfig>;
  /** MIDI export options */
  midiExport?: MidiExportOptions;
  /** Initial highlight mode for note rendering */
  defaultHighlightMode?: HighlightMode;
  /**
   * When false, disables external drag & drop upload surfaces.
   * Click-to-open remains available.
   */
  allowFileDrop?: boolean;
}
