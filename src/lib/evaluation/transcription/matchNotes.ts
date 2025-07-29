import { TranscriptionToleranceOptions, DEFAULT_TOLERANCES } from "./constants";
import { parsedMidiToIntervalsAndPitches } from "./utils";
import { ParsedMidi } from "@/lib/midi/types";

/**
 * Result of a note-level matching operation.
 */
export interface NoteMatchResult {
  /** Pairs of matched reference-estimated indices */
  matches: Array<{
    ref: number;
    est: number;
    refPitch: number;
    estPitch: number;
    refTime: number;
    estTime: number;
  }>;
  /** Indices of unmatched reference notes */
  falseNegatives: number[];
  /** Indices of unmatched estimated notes */
  falsePositives: number[];
}

/**
 * Match notes between reference and estimated MIDI representations following
 * the heuristic used by `mir_eval.transcription.match_notes`.
 *
 * A reference and estimated note are considered a match when:
 * - their onsets differ by at most `onsetTolerance` seconds.
 * - their pitches (in MIDI) differ by at most `pitchTolerance`.
 * - their offsets differ by at most `offsetRatioTolerance x referenceDuration`.
 *
 * Each reference (estimated) note can be matched to at most one estimated
 * (reference) note.  The algorithm iterates over the estimated notes in order
 * of onset and greedily assigns the first compatible reference note.
 */
export function matchNotes(
  reference: ParsedMidi,
  estimated: ParsedMidi,
  options: Partial<TranscriptionToleranceOptions> = {}
): NoteMatchResult {
  const { onsetTolerance, pitchTolerance, offsetRatioTolerance } = {
    ...DEFAULT_TOLERANCES,
    ...options,
  };

  const refData = parsedMidiToIntervalsAndPitches(reference);
  const estData = parsedMidiToIntervalsAndPitches(estimated);

  const refMatched: boolean[] = new Array(refData.intervals.length).fill(false);
  const estMatched: boolean[] = new Array(estData.intervals.length).fill(false);
  const matches: Array<{
    ref: number;
    est: number;
    refPitch: number;
    estPitch: number;
    refTime: number;
    estTime: number;
  }> = [];

  // Iterate over estimated notes in order of onset time
  const estIndices = estData.intervals
    .map((intv, idx) => ({ idx, onset: intv[0] }))
    .sort((a, b) => a.onset - b.onset)
    .map(({ idx }) => idx);

  for (const estIdx of estIndices) {
    if (estMatched[estIdx]) continue;

    const [estOnset, estOffset] = estData.intervals[estIdx];
    const estPitch = estData.pitches[estIdx];

    // Find the first reference note that satisfies all tolerances
    for (let refIdx = 0; refIdx < refData.intervals.length; refIdx++) {
      if (refMatched[refIdx]) continue;

      const [refOnset, refOffset] = refData.intervals[refIdx];
      const refPitch = refData.pitches[refIdx];

      const onsetDiff = Math.abs(estOnset - refOnset);
      const pitchDiff = Math.abs(estPitch - refPitch);
      const offsetDiff = Math.abs(estOffset - refOffset);
      const refDuration = refOffset - refOnset;

      if (
        onsetDiff <= onsetTolerance &&
        pitchDiff <= pitchTolerance &&
        offsetDiff <= offsetRatioTolerance * refDuration
      ) {
        // Found a match
        refMatched[refIdx] = true;
        estMatched[estIdx] = true;
        matches.push({
          ref: refIdx,
          est: estIdx,
          refPitch,
          estPitch,
          refTime: refOnset,
          estTime: estOnset,
        });
        break; // move to next estimated note
      }
    }
  }

  const falseNegatives: number[] = [];
  const falsePositives: number[] = [];

  refMatched.forEach((m, i) => {
    if (!m) falseNegatives.push(i);
  });
  estMatched.forEach((m, i) => {
    if (!m) falsePositives.push(i);
  });

  return { matches, falseNegatives, falsePositives };
}
