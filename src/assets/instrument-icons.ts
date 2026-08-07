/**
 * SVG Icons for instrument families
 * Used in Settings UI to visually distinguish track types
 *
 * Design System:
 * - Base Grid: 24x24 viewBox
 * - Style: Lucide/Feather (clean lines, rounded corners)
 * - Attributes: stroke="currentColor", stroke-width="2", fill="none"
 *
 * 16px Readability Heuristics:
 * - Piano: compact keyboard with three clear black-key blocks
 * - Strings: violin silhouette with paired f-holes and vertical strings
 * - Drums: single shell + lid with one diagonal stick
 * - Guitar: circular body plus angled neck with tuning nubs
 * - Bass: offset body with long neck, bridge rails, and tuning dots
 * - Synth: rack with two knobs plus three grouped keys
 * - Winds: horizontal flute pill, mouthpiece, and three tone holes
 * - Brass: flared trumpet bell, short lead pipe, and two valves
 * - Vocal: microphone with singing figure silhouette
 * - Organ: pipe organ with vertical pipes
 * - Mallet: maracas percussion instrument
 * - Others: generic musical note retained for catch-all usage
 */

import { InstrumentFamily } from "@/lib/midi/types";
import { prepareSvg } from "./icon-utils";

import pianoRaw from "./icons/instrument/piano.svg?raw";
import stringsRaw from "./icons/instrument/strings.svg?raw";
import drumsRaw from "./icons/instrument/drums.svg?raw";
import guitarRaw from "./icons/instrument/guitar.svg?raw";
import bassRaw from "./icons/instrument/bass.svg?raw";
import synthRaw from "./icons/instrument/synth.svg?raw";
import windsRaw from "./icons/instrument/winds.svg?raw";
import brassRaw from "./icons/instrument/brass.svg?raw";
import vocalRaw from "./icons/instrument/vocal.svg?raw";
import organRaw from "./icons/instrument/organ.svg?raw";
import malletRaw from "./icons/instrument/mallet.svg?raw";
import othersRaw from "./icons/instrument/others.svg?raw";
import chevronDownRaw from "./icons/player/chevron-down.svg?raw";
import chevronRightRaw from "./icons/player/chevron-right.svg?raw";

/**
 * SVG icons for each instrument family.
 * All icons use 24x24 viewBox with Lucide/Feather styling.
 */
export const INSTRUMENT_ICONS: Record<InstrumentFamily, string> = {
  piano: prepareSvg(pianoRaw),
  strings: prepareSvg(stringsRaw),
  drums: prepareSvg(drumsRaw),
  guitar: prepareSvg(guitarRaw),
  bass: prepareSvg(bassRaw),
  synth: prepareSvg(synthRaw),
  winds: prepareSvg(windsRaw),
  brass: prepareSvg(brassRaw),
  vocal: prepareSvg(vocalRaw),
  organ: prepareSvg(organRaw),
  mallet: prepareSvg(malletRaw),
  others: prepareSvg(othersRaw),
};

/**
 * Get the SVG icon for a given instrument family.
 * @param family - The instrument family
 * @returns SVG string for the icon
 */
export function getInstrumentIcon(family: InstrumentFamily): string {
  return INSTRUMENT_ICONS[family] ?? INSTRUMENT_ICONS.others;
}

/**
 * Chevron icon for accordion expand/collapse
 */
export const CHEVRON_DOWN = prepareSvg(chevronDownRaw);

export const CHEVRON_RIGHT = prepareSvg(chevronRightRaw);
