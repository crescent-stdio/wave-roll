import { NoteData } from "@/lib/midi/types";
import {
  TranscriptionToleranceOptions,
  DEFAULT_TOLERANCES,
} from "@/lib/evaluation/transcription/constants";

/**
 * Describes the aggregated result of one overlap cluster.
 */
export interface OverlapResult {
  /** Averaged onset time (seconds). */
  onset: number;
  /** Averaged duration (seconds). */
  duration: number;
  /** Averaged MIDI pitch - rounded to the nearest integer. */
  pitch: number;
  /** Zero-based indices of the MIDI files participating in the cluster. */
  fileIndices: number[];
}

/**
 * Group notes that are considered the same across different files.
 *
 * Two notes are deemed equal when both their onset and pitch lie within the
 * provided tolerances.  All notes fulfilling this condition form an undirected
 * graph; connected components of size >= 2 are returned as overlap groups.  For
 * every group the function yields one representative note with averaged
 * onset/duration/pitch alongside the list of contributing file indices.
 *
 * The algorithm runs in O(N²) time which is sufficient for the typical note
 * counts encountered in a piano-roll visualiser.
 */
export function groupOverlappingNotes(
  notesByFile: NoteData[][],
  tolerances: TranscriptionToleranceOptions = DEFAULT_TOLERANCES
): OverlapResult[] {
  type Flat = { note: NoteData; fileIdx: number; flatIdx: number };

  // --- 1) Flatten into a single array ------------------------------------
  const flat: Flat[] = [];
  notesByFile.forEach((arr, fi) => {
    arr.forEach((n) =>
      flat.push({ note: n, fileIdx: fi, flatIdx: flat.length })
    );
  });
  const n = flat.length;
  if (n === 0) return [];

  // --- 2) Union-Find to build connected components ------------------------
  const parent: number[] = new Array(n).fill(0).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]; // path compression
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  const { onsetTolerance, pitchTolerance } = tolerances;

  for (let i = 0; i < n; i++) {
    const ni = flat[i].note;
    for (let j = i + 1; j < n; j++) {
      const nj = flat[j].note;
      if (
        Math.abs(ni.time - nj.time) <= onsetTolerance &&
        Math.abs(ni.midi - nj.midi) <= pitchTolerance
      ) {
        union(i, j);
      }
    }
  }

  // --- 3) Collect clusters -------------------------------------------------
  const clusters: Map<number, Flat[]> = new Map();
  flat.forEach((f, idx) => {
    const root = find(idx);
    const arr = clusters.get(root) ?? [];
    arr.push(f);
    clusters.set(root, arr);
  });

  // --- 4) Aggregate --------------------------------------------------------
  const results: OverlapResult[] = [];
  clusters.forEach((group) => {
    if (group.length < 2) return; // Need >=2 notes to qualify as overlap

    const onset = group.reduce((acc, g) => acc + g.note.time, 0) / group.length;
    const duration =
      group.reduce((acc, g) => acc + g.note.duration, 0) / group.length;
    const pitch = Math.round(
      group.reduce((acc, g) => acc + g.note.midi, 0) / group.length
    );
    const fileIndices = [...new Set(group.map((g) => g.fileIdx))];

    results.push({ onset, duration, pitch, fileIndices });
  });

  return results;
}
