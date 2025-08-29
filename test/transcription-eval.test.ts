/**
 * Unit tests for transcription evaluation (note-level + velocity-aware).
 *
 * Notes:
 * - These tests use synthetic inputs with seconds for time, MIDI for pitch,
 *   and normalized velocity in [0,1].
 * - We verify logical equivalence to mir_eval's intent (onset/pitch/offset
 *   gating with unique assignment) and basic velocity behaviours.
 */
import { describe, it, expect } from 'vitest';
import type { ParsedMidi, NoteData } from '@/lib/midi/types';
import {
  matchNotes,
  matchNotesWithVelocity,
  computeNoteMetrics,
  computeVelocityMetrics,
  DEFAULT_TOLERANCES,
} from '@/lib/evaluation/transcription';

function pm(notes: NoteData[]): ParsedMidi {
  return {
    header: { name: 't', tempos: [], timeSignatures: [], PPQ: 480 },
    duration: Math.max(0, ...notes.map(n => n.time + n.duration)),
    track: { name: 't', channel: 0 },
    notes,
    controlChanges: [],
  } as ParsedMidi;
}

describe('matchNotes basic equivalence', () => {
  it('matches identical single notes', () => {
    const ref = pm([{ midi: 60, time: 0, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.8, duration: 1 } as any]);
    const est = pm([{ midi: 60, time: 0.01, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.82, duration: 1.02 } as any]);
    const res = matchNotes(ref, est, DEFAULT_TOLERANCES);
    expect(res.matches.length).toBe(1);
    expect(res.falseNegatives.length).toBe(0);
    expect(res.falsePositives.length).toBe(0);
    // overlap ratio populated
    expect(res.matches[0].overlapRatio).toBeGreaterThan(0.9);
  });

  it('respects offset tolerance min when ref has zero duration', () => {
    const ref = pm([{ midi: 60, time: 1.0, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.6, duration: 0 } as any]);
    const est = pm([{ midi: 60, time: 1.0, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.6, duration: 0.04 } as any]);
    const res = matchNotes(ref, est, DEFAULT_TOLERANCES); // offsetMinTolerance = 0.05
    // est offset diff 0.04 <= 0.05 -> should match
    expect(res.matches.length).toBe(1);
  });

  it('unique assignment on duplicates (one-to-one)', () => {
    const ref = pm([
      { midi: 60, time: 0, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.5, duration: 0.5 } as any,
      { midi: 60, time: 0, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.7, duration: 0.5 } as any,
    ]);
    const est = pm([
      { midi: 60, time: 0.01, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.6, duration: 0.52 } as any,
      { midi: 60, time: 0.01, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.8, duration: 0.52 } as any,
    ]);
    const res = matchNotes(ref, est, DEFAULT_TOLERANCES);
    expect(res.matches.length).toBe(2);
  });
});

describe('velocity-aware metrics', () => {
  it('counts velocity-correct under threshold mode', () => {
    const ref = pm([
      { midi: 60, time: 0, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.50, duration: 1 } as any,
      { midi: 62, time: 2, ticks: 0, name: 'D4', pitch: 'D', octave: 4, velocity: 0.60, duration: 1 } as any,
    ]);
    const est = pm([
      { midi: 60, time: 0.01, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.58, duration: 1.0 } as any, // dv=0.08 OK if tol=0.1
      { midi: 62, time: 2.01, ticks: 0, name: 'D4', pitch: 'D', octave: 4, velocity: 0.80, duration: 1.0 } as any, // dv=0.20 > 0.1 -> not OK
    ]);
    const res = computeVelocityMetrics(ref, est, DEFAULT_TOLERANCES, {
      velocityTolerance: 0.1,
      unit: 'normalized',
      mode: 'threshold',
      includeInMatching: false,
    });
    expect(res.matches.length).toBe(2);
    expect(res.velocity.numVelocityCorrect).toBe(1);
    expect(res.velocity.accuracyOnMatches).toBeCloseTo(0.5, 1);
  });

  it('velocity gating reduces matches when includeInMatching=true', () => {
    const ref = pm([
      { midi: 60, time: 0, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.50, duration: 1 } as any,
    ]);
    const est = pm([
      { midi: 60, time: 0.01, ticks: 0, name: 'C4', pitch: 'C', octave: 4, velocity: 0.80, duration: 1.0 } as any, // dv=0.3
    ]);
    const res = matchNotesWithVelocity(ref, est, DEFAULT_TOLERANCES, {
      velocityTolerance: 0.1,
      unit: 'normalized',
      includeInMatching: true,
    });
    expect(res.matches.length).toBe(0);
  });
});

