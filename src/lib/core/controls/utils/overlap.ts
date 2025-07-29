export interface NoteInterval {
  /** Start time in seconds (inclusive) */
  start: number;
  /** End time in seconds (exclusive) */
  end: number;
}

export interface Track {
  id: string;
  /** Array of time intervals belonging to this track */
  intervals: NoteInterval[];
  /** Whether this track is visible in the current piano-roll view */
  visible?: boolean;
}

/**
 * Returns merged segments where **two or more visible tracks** overlap.
 * The implementation runs in O(N log N) using a sweep-line that counts
 * active intervals (+1 on start, -1 on end).
 */
export function overlapping(tracks: Track[]): NoteInterval[] {
  type Event = { time: number; delta: 1 | -1 };

  const events: Event[] = [];

  // 1) Collect start / end events from visible tracks only.
  for (const track of tracks) {
    if (track.visible === false) continue; // hidden -> skip

    for (const { start, end } of track.intervals) {
      if (end <= start) continue; // ignore invalid / zero-length ranges
      events.push({ time: start, delta: 1 });
      events.push({ time: end, delta: -1 });
    }
  }

  if (events.length === 0) return [];

  // 2) Sort by time asc. Tie-breakers: END (-1) before START (+1)
  events.sort((a, b) =>
    a.time === b.time ? a.delta - b.delta : a.time - b.time
  );

  // 3) Sweep through the timeline, tracking the number of active tracks.
  const overlaps: NoteInterval[] = [];
  let active = 0;
  let currentStart: number | null = null;

  for (const { time, delta } of events) {
    const prevActive = active;
    active += delta;

    // Transition into an overlap region (≥2 active -> start)
    if (prevActive < 2 && active >= 2) {
      currentStart = time;
    }
    // Transition out of an overlap region (became <2 active -> end)
    else if (prevActive >= 2 && active < 2 && currentStart !== null) {
      if (time > currentStart) {
        overlaps.push({ start: currentStart, end: time });
      }
      currentStart = null;
    }
  }

  return overlaps;
}
