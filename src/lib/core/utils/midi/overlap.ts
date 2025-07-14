import { NoteData } from "@/lib/midi/types";

/**
 * Detects overlapping notes between different MIDI files
 * @param notes Array of note objects with color and file ID information
 * @returns Map where the key is the note index and the value is the overlapping time range { start, end }
 */
export function detectOverlappingNotes(
  notes: Array<{ note: NoteData; color: number; fileId: string }>
): Map<number, Array<{ start: number; end: number }>> {
  const overlappingRanges = new Map<
    number,
    Array<{ start: number; end: number }>
  >();

  // Iterate over all note pairs to find overlaps
  for (let i = 0; i < notes.length; i++) {
    const noteA = notes[i].note;
    for (let j = i + 1; j < notes.length; j++) {
      const noteB = notes[j].note;

      // Only compare notes that come from different files and share the same pitch
      if (notes[i].fileId === notes[j].fileId || noteA.midi !== noteB.midi) {
        continue;
      }

      // Calculate overlap interval
      const overlapStart = Math.max(noteA.time, noteB.time);
      const overlapEnd = Math.min(
        noteA.time + noteA.duration,
        noteB.time + noteB.duration
      );

      if (overlapEnd <= overlapStart) {
        continue; // No actual overlap
      }

      // Push range helper
      const addRange = (idx: number, start: number, end: number): void => {
        const ranges = overlappingRanges.get(idx) ?? [];
        ranges.push({ start, end });
        overlappingRanges.set(idx, ranges);
      };

      addRange(i, overlapStart, overlapEnd);
      addRange(j, overlapStart, overlapEnd);
    }
  }

  // Merge overlapping ranges for each note, but keep distinct adjoining ranges
  // separate so that we end up with disjoint intervals as required.
  overlappingRanges.forEach((ranges, idx) => {
    if (ranges.length <= 1) return;

    // Sort by start time
    ranges.sort((a, b) => a.start - b.start);

    const merged: Array<{ start: number; end: number }> = [];
    let current = { ...ranges[0] };

    for (let k = 1; k < ranges.length; k++) {
      const r = ranges[k];
      if (r.start < current.end) {
        // Ranges overlap by a positive amount → extend
        current.end = Math.max(current.end, r.end);
      } else {
        // Touching (r.start === current.end) or separated → keep separate
        merged.push(current);
        current = { ...r };
      }
    }
    merged.push(current);

    overlappingRanges.set(idx, merged);
  });

  return overlappingRanges;
}
