import { describe, test, expect, vi, beforeEach } from 'vitest';

// Minimal window shim
// @ts-ignore
globalThis.window = globalThis as any;

// Mock Tone
vi.mock('tone', () => {
  const startCalls: any[] = [];
  class Part {
    public _startCalls = startCalls;
    constructor(public cb: any, public events: any[]) {}
    start = vi.fn((when?: number, offset?: number) => {
      startCalls.push({ when, offset });
    });
    stop = vi.fn();
    cancel = vi.fn();
    dispose = vi.fn();
  }
  class Sampler { connect() { return this; } triggerAttackRelease = vi.fn(); dispose = vi.fn(); }
  class Gain { constructor(public value: number) {} get gain() { return { value: 1 }; } dispose = vi.fn(); }
  class Panner { pan = { value: 0 }; toDestination() { return this; } connect() { return this; } dispose = vi.fn(); }
  const transport = { state: 'started', seconds: 100, bpm: { value: 120 }, start: vi.fn(), stop: vi.fn(), pause: vi.fn(), cancel: vi.fn(), on: vi.fn(), off: vi.fn() };
  return {
    getTransport: () => transport,
    context: { currentTime: 0, state: 'running' },
    now: () => 0,
    Part,
    Sampler,
    Gain,
    Panner,
  };
});

import * as Tone from 'tone';
import { MidiPlayerGroup } from '../src/lib/core/audio/managers/midi-player-group';

describe('MidiPlayerGroup seek scheduling', () => {
  beforeEach(() => {
    // @ts-ignore
    (Tone.getTransport() as any).state = 'started';
    // @ts-ignore
    (Tone.getTransport() as any).seconds = 100;
  });

  test('seek schedules Part.start at transport 0 with zero offset', async () => {
    const group = new MidiPlayerGroup();
    // Provide minimal notes and manager
    (group as any).setMidiManager({
      notes: [
        { time: 100, duration: 0.5, pitch: 60, velocity: 0.8, fileId: 'm1' },
      ],
    });
    // Force sampler creation without network
    (group as any).players.set('m1', {
      fileId: 'm1',
      sampler: new (Tone as any).Sampler(),
      gate: new (Tone as any).Gain(1),
      panner: new (Tone as any).Panner(0),
      volume: 1,
      pan: 0,
      muted: false,
    });

    await (group as any).startSynchronized({
      audioContextTime: 1.5,
      toneTransportTime: 0,
      masterTime: 100,
      generation: 1,
      mode: 'seek',
    });

    const calls = (Tone as any).Part.prototype._startCalls as Array<{ when: number; offset: number }>;
    expect(calls.length).toBeGreaterThan(0);
    const { when, offset } = calls[calls.length - 1];
    // Expect scheduling at transport time 0 (master clock positions transport.seconds beforehand)
    expect(when ?? 0).toBe(0);
    expect(offset ?? 0).toBe(0);
  });
});


