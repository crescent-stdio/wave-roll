import { scaleLinear, type ScaleLinear } from "d3-scale";
import type { NoteData } from "@/lib/midi/types";
import type { PianoRollOptions } from "../types";

/**
 * Object returned by createScales.
 * pxPerSecond is included so the caller can cache it
 * and feed it back on the next call to preserve spacing.
 */
export interface Scales {
  timeScale: ScaleLinear<number, number>;
  pitchScale: ScaleLinear<number, number>;
  pxPerSecond: number;
}

/**
 * Derives time- and pitch-axis scales for the piano-roll visualiser.
 *
 * @param notes             MIDI notes already loaded
 * @param options            State of the piano roll
 * @param currentPxPerSecond   Previously computed px/sec ratio (or null)
 * @param TARGET_VISIBLE_SECONDS  How many seconds the viewport should show
 *                                when zoomX === 1 (default = 8 seconds)
 */
export function createScales(
  notes: NoteData[],
  options: Required<
    Pick<PianoRollOptions, "width" | "height" | "noteRange" | "showPianoKeys">
  >,
  currentPxPerSecond: number | null = null,
  TARGET_VISIBLE_SECONDS = 8
): Scales {
  // 1. Determine the track's total length.
  const maxTime =
    notes.length > 0 ? Math.max(...notes.map((n) => n.time + n.duration)) : 60; // Fallback when no data are present.

  // 2. Decide the baseline pixel-per-second ratio.
  //    The same value is reused on subsequent calls so that grid spacing
  //    never "jumps" when extra notes push maxTime forward.
  const pianoKeysOffset = options.showPianoKeys ? 60 : 0;
  const pxPerSecond =
    currentPxPerSecond ??
    (options.width - pianoKeysOffset) / TARGET_VISIBLE_SECONDS;

  // 3. Build the D3 scales.
  const rangeEnd = maxTime * pxPerSecond;

  const timeScale = scaleLinear<number, number>()
    .domain([0, maxTime])
    .range([0, rangeEnd]);

  const pitchScale = scaleLinear<number, number>()
    .domain([options.noteRange.min, options.noteRange.max])
    // Invert Y axis so low notes sit near the bottom edge.
    .range([options.height - 20, 20]);

  return { timeScale, pitchScale, pxPerSecond };
}
