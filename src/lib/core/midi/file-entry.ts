import { ParsedMidi } from "@/lib/midi/types";
import { ColorPalette, MidiFileEntry } from "@/lib/midi/types";
import { generateMidiFileId } from "@/lib/core/utils/id";

/**
 * Create a new `MidiFileEntry`.
 *
 * @param fileName     Original filename on disk.
 * @param parsedData   Parsed result from @tonejs/midi (or equivalent).
 * @param color        Display color (integer RGB).
 * @param name         Optional name for the file.
 * @param originalInput Original file input for re-parsing.
 */
export function createMidiFileEntry(
  fileName: string,
  parsedData: ParsedMidi,
  color: number,
  name?: string,
  originalInput?: File | string
): MidiFileEntry {
  const isVsCodeWebview =
    typeof (globalThis as unknown as { acquireVsCodeApi?: unknown })
      .acquireVsCodeApi === "function";

  return {
    id: generateMidiFileId(),
    // VS Code 통합 시에는 확장자를 포함한 원본 파일명을 그대로 사용해 표시를 보존한다.
    name:
      name ?? (isVsCodeWebview ? fileName : fileName.replace(/\.mid$/i, "")),
    fileName,
    parsedData,
    isVisible: true,
    isPianoRollVisible: true,
    isSustainVisible: false,
    fileColor: color,
    color,
    isMuted: false,
    originalInput,
  };
}

/**
 * Reassign colors to an existing list of file entries based on the given palette.
 * The nth entry receives `palette.colors[n % palette.colors.length]`.
 *
 * @param entries - The list of file entries to reassign colors to.
 * @param palette - The color palette to use.
 */
export function reassignEntryColors(
  entries: MidiFileEntry[],
  palette: ColorPalette
): void {
  entries.forEach((entry, index) => {
    entry.color = palette.colors[index % palette.colors.length];
  });
}
