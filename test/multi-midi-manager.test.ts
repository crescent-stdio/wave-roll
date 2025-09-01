/**
 * MultiMidiManager visibility and notes aggregation tests.
 *
 * Contracts:
 * - toggleVisibility keeps `isVisible` and `isPianoRollVisible` in sync.
 * - getVisibleNotes returns only notes from visible files, sorted by time.
 */
import { describe, it, expect } from 'vitest';
import { MultiMidiManager } from '@/lib/core/midi/multi-midi-manager';
import type { ParsedMidi, NoteData } from '@/lib/midi/types';

function midi(name: string, notes: Partial<NoteData>[]): ParsedMidi {
  const full: NoteData[] = notes.map((n, i) => ({
    midi: n.midi ?? (60 + i),
    time: n.time ?? i * 0.25,
    ticks: 0,
    name: n.name ?? 'N',
    pitch: n.pitch ?? 'C',
    octave: n.octave ?? 4,
    velocity: n.velocity ?? 0.7,
    duration: n.duration ?? 0.5,
  } as any));
  return {
    header: { name, tempos: [], timeSignatures: [], PPQ: 480 },
    duration: Math.max(0, ...full.map(n => n.time + n.duration)),
    track: { name, channel: 0 },
    notes: full,
    controlChanges: [],
  };
}

describe('MultiMidiManager', () => {
  it('syncs isVisible and isPianoRollVisible on toggle', () => {
    const mm = new MultiMidiManager();
    const id = mm.addMidiFile('a.mid', midi('A', [{ time: 0, duration: 1 }]), 'A');
    const state1 = mm.getState();
    const f1 = state1.files.find(f => f.id === id)!;
    expect(f1.isVisible).toBe(true);
    expect(f1.isPianoRollVisible).toBe(true);

    mm.toggleVisibility(id);
    const f2 = mm.getState().files.find(f => f.id === id)!;
    expect(f2.isVisible).toBe(false);
    expect(f2.isPianoRollVisible).toBe(false);

    mm.toggleVisibility(id);
    const f3 = mm.getState().files.find(f => f.id === id)!;
    expect(f3.isVisible).toBe(true);
    expect(f3.isPianoRollVisible).toBe(true);
  });

  it('getVisibleNotes returns only visible files, sorted by time', () => {
    const mm = new MultiMidiManager();
    const idA = mm.addMidiFile('a.mid', midi('A', [ { time: 0.5, duration: 0.2 }, { time: 0.1, duration: 0.2 } ]), 'A');
    const idB = mm.addMidiFile('b.mid', midi('B', [ { time: 0.3, duration: 0.2 } ]), 'B');

    // Hide B
    mm.toggleVisibility(idB);
    const notes = mm.getVisibleNotes();
    expect(notes.length).toBe(2);
    // Sorted by time ascending
    expect(notes[0].note.time).toBeLessThanOrEqual(notes[1].note.time);
    // All from file A
    expect(new Set(notes.map(n => n.fileId))).toEqual(new Set([idA]));
  });
});

