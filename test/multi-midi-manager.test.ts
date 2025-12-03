/**
 * MultiMidiManager visibility and notes aggregation tests.
 *
 * Contracts:
 * - toggleVisibility keeps `isVisible` and `isPianoRollVisible` in sync.
 * - getVisibleNotes returns only notes from visible files, sorted by time.
 * - trackVisibility controls per-track note filtering.
 */
import { describe, it, expect } from 'vitest';
import { MultiMidiManager } from '@/lib/core/midi/multi-midi-manager';
import { getInstrumentFamily } from '@/lib/core/parsers/midi-parser';
import type { ParsedMidi, NoteData, TrackInfo } from '@/lib/midi/types';

/**
 * Create a mock ParsedMidi object for testing.
 * Optionally supports multi-track with trackId on notes.
 */
function midi(
  name: string,
  notes: Partial<NoteData>[],
  tracks?: TrackInfo[]
): ParsedMidi {
  const full: NoteData[] = notes.map((n, i) => ({
    midi: n.midi ?? (60 + i),
    time: n.time ?? i * 0.25,
    ticks: 0,
    name: n.name ?? 'N',
    pitch: n.pitch ?? 'C',
    octave: n.octave ?? 4,
    velocity: n.velocity ?? 0.7,
    duration: n.duration ?? 0.5,
    trackId: n.trackId,
  } as any));
  return {
    header: { name, tempos: [], timeSignatures: [], PPQ: 480 },
    duration: Math.max(0, ...full.map(n => n.time + n.duration)),
    track: { name, channel: 0 },
    notes: full,
    controlChanges: [],
    tracks: tracks ?? [],
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

  it('trackVisibility filters notes by track', () => {
    const mm = new MultiMidiManager();
    
    // Create multi-track MIDI with notes from different tracks
    const tracks: TrackInfo[] = [
      { id: 0, name: 'Piano', channel: 0, isDrum: false, instrumentFamily: 'piano', noteCount: 2 },
      { id: 1, name: 'Drums', channel: 9, isDrum: true, instrumentFamily: 'drums', noteCount: 1 },
    ];
    const notes: Partial<NoteData>[] = [
      { time: 0.0, duration: 0.5, trackId: 0 },
      { time: 0.5, duration: 0.5, trackId: 0 },
      { time: 0.25, duration: 0.25, trackId: 1 },
    ];
    const fileId = mm.addMidiFile('multi.mid', midi('Multi', notes, tracks), 'Multi');

    // All notes visible by default
    expect(mm.getVisibleNotes().length).toBe(3);

    // Hide track 1 (drums)
    mm.setTrackVisibility(fileId, 1, false);
    const afterHide = mm.getVisibleNotes();
    expect(afterHide.length).toBe(2);
    expect(afterHide.every(n => n.note.trackId === 0)).toBe(true);

    // Show track 1 again
    mm.toggleTrackVisibility(fileId, 1);
    expect(mm.getVisibleNotes().length).toBe(3);
  });

  it('isTrackVisible returns correct visibility state', () => {
    const mm = new MultiMidiManager();
    const tracks: TrackInfo[] = [
      { id: 0, name: 'Piano', channel: 0, isDrum: false, instrumentFamily: 'piano', noteCount: 1 },
    ];
    const fileId = mm.addMidiFile('test.mid', midi('Test', [{ trackId: 0 }], tracks), 'Test');

    // Default visible
    expect(mm.isTrackVisible(fileId, 0)).toBe(true);

    // Toggle off
    mm.setTrackVisibility(fileId, 0, false);
    expect(mm.isTrackVisible(fileId, 0)).toBe(false);

    // Toggle on
    mm.setTrackVisibility(fileId, 0, true);
    expect(mm.isTrackVisible(fileId, 0)).toBe(true);
  });
});

describe('getInstrumentFamily GM Mapping', () => {
  it('maps piano programs (0-7) to piano', () => {
    expect(getInstrumentFamily(0, 0)).toBe('piano');
    expect(getInstrumentFamily(7, 0)).toBe('piano');
  });

  it('maps guitar programs (24-31) to guitar', () => {
    expect(getInstrumentFamily(24, 0)).toBe('guitar');
    expect(getInstrumentFamily(31, 0)).toBe('guitar');
  });

  it('maps bass programs (32-39) to bass', () => {
    expect(getInstrumentFamily(32, 0)).toBe('bass');
    expect(getInstrumentFamily(39, 0)).toBe('bass');
  });

  it('maps strings programs (40-55) to strings', () => {
    expect(getInstrumentFamily(40, 0)).toBe('strings');
    expect(getInstrumentFamily(55, 0)).toBe('strings');
  });

  it('maps brass programs (56-63) to brass', () => {
    expect(getInstrumentFamily(56, 0)).toBe('brass');
    expect(getInstrumentFamily(63, 0)).toBe('brass');
  });

  it('maps winds programs (64-79) to winds', () => {
    expect(getInstrumentFamily(64, 0)).toBe('winds');
    expect(getInstrumentFamily(79, 0)).toBe('winds');
  });

  it('maps synth programs (80-103) to synth', () => {
    expect(getInstrumentFamily(80, 0)).toBe('synth');
    expect(getInstrumentFamily(103, 0)).toBe('synth');
  });

  it('maps percussion programs (112-119) to drums', () => {
    expect(getInstrumentFamily(112, 0)).toBe('drums');
    expect(getInstrumentFamily(119, 0)).toBe('drums');
  });

  it('maps channel 9 (GM drum channel) to drums regardless of program', () => {
    expect(getInstrumentFamily(0, 9)).toBe('drums');
    expect(getInstrumentFamily(50, 9)).toBe('drums');
    expect(getInstrumentFamily(127, 9)).toBe('drums');
  });

  it('maps channel 10 (1-indexed drum channel) to drums', () => {
    expect(getInstrumentFamily(0, 10)).toBe('drums');
  });

  it('maps unknown programs to others', () => {
    expect(getInstrumentFamily(8, 0)).toBe('others');  // Chromatic percussion
    expect(getInstrumentFamily(120, 0)).toBe('others'); // Sound effects
    expect(getInstrumentFamily(127, 0)).toBe('others');
  });
});

