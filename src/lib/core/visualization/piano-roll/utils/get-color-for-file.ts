import { PianoRoll } from "../piano-roll";

/**
 * Resolve a representative colour for a given file identifier. The function
 * looks for the first note that originates from the provided `fid` and, using
 * the configured `noteRenderer` (if any), derives the colour that should be
 * used to render elements belonging to that file. The result is cached in the
 * supplied `cache` object so the expensive linear scan is performed only once
 * per `fid`.
 *
 * @param pianoRoll - The PianoRoll instance that holds the note data.
 * @param fid       - Identifier of the source file to resolve a colour for.
 * @param cache     - Mutable cache mapping fileId ➜ colour to avoid repeats.
 *
 * @returns The colour (hex number) that should be used for rendering.
 */
export function getColorForFile(
  pianoRoll: PianoRoll,
  fid: string,
  cache: Record<string, number>
): number {
  // Return cached value when available.
  if (cache[fid] !== undefined) return cache[fid];

  // Find the first note belonging to the requested file.
  for (let i = 0; i < pianoRoll.notes.length; i++) {
    const note = pianoRoll.notes[i];
    if (note.fileId === fid) {
      // If highlight mode changes per-note colours (simple / exclusive),
      // fall back to the original per-file colour so sustain overlay
      // stays consistent with the sidebar swatch.
      const hl = (pianoRoll as any).highlightMode ?? "file";
      const colour =
        hl === "file"
          ? pianoRoll.options.noteRenderer
            ? pianoRoll.options.noteRenderer(note, i)
            : pianoRoll.options.noteColor
          : pianoRoll.options.noteColor; // original file colour

      cache[fid] = colour;
      return colour;
    }
  }

  // Fallback to the default note colour when no note matched the fileId.
  return (cache[fid] = pianoRoll.options.noteColor);
}

export function getOriginalColorForFile(pianoRoll: PianoRoll): number {
  return pianoRoll.options.fileNoteColor ?? pianoRoll.options.noteColor;
}
