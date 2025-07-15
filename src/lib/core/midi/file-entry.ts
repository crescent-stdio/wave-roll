import { ParsedMidi } from "@/lib/midi/types";
import { ColorPalette, MidiFileEntry } from "@/lib/midi/types";
import { generateMidiFileId } from "@/lib/core/utils/id";

/**
 * Create a new `MidiFileEntry`.
 *
 * @param fileName     Original filename on disk.
 * @param parsedData   Parsed result from @tonejs/midi (or equivalent).
 * @param color        Display colour (integer RGB).
 * @param displayName  Optional user‑friendly name shown in UI.
 */
export function createMidiFileEntry(
  fileName: string,
  parsedData: ParsedMidi,
  color: number,
  displayName?: string
): MidiFileEntry {
  return {
    id: generateMidiFileId(),
    displayName: displayName ?? fileName.replace(/\.mid$/i, ""),
    fileName,
    parsedData,
    isVisible: true,
    isPianoRollVisible: true,
    color,
    isMuted: false,
  };
}

/**
 * Reassign colours to an existing list of file entries based on the given palette.
 * The nth entry receives `palette.colors[n % palette.colors.length]`.
 *
 * @param entries - The list of file entries to reassign colours to.
 * @param palette - The colour palette to use.
 */
export function reassignEntryColors(
  entries: MidiFileEntry[],
  palette: ColorPalette
): void {
  entries.forEach((entry, index) => {
    entry.color = palette.colors[index % palette.colors.length];
  });
}
