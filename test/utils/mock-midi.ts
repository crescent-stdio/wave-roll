import type { ParsedMidi, NoteData } from "@/lib/midi/types";

export function createMockMidi(notes: Partial<NoteData>[]): ParsedMidi {
  const fullNotes: NoteData[] = notes.map((n) => ({
    midi: n.midi ?? 60,
    time: n.time ?? 0,
    ticks: n.ticks ?? 0,
    name: n.name ?? "C4",
    pitch: n.pitch ?? "C",
    octave: n.octave ?? 4,
    velocity: n.velocity ?? 0.8,
    duration: n.duration ?? 0.5,
    fileId: (n as any).fileId ?? "test",
    ...n,
  }));

  return {
    header: {
      name: "Test",
      tempos: [],
      timeSignatures: [],
      PPQ: 480,
    },
    duration: fullNotes.length > 0 ? Math.max(...fullNotes.map((nn) => nn.time + nn.duration)) : 0,
    track: { name: "Piano", channel: 0 },
    notes: fullNotes,
    controlChanges: [],
  };
}


