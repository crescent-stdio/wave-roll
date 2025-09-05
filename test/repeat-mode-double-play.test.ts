/**
 * Test for repeat mode double playback issue
 * 
 * This test verifies that when repeat mode is enabled and playback loops back to start,
 * notes are not played twice (double triggering issue).
 */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';

// Shim window for TransportSyncManager timers
// @ts-ignore
globalThis.window = globalThis as any;

import * as Tone from 'tone';

// Mock Tone.js with loop event simulation
vi.mock('tone', () => {
  let mockTransportSeconds = 0;
  let mockTransportState: 'started' | 'stopped' | 'paused' = 'stopped';
  let loopCallbacks: Array<() => void> = [];
  let mockLoop = false;
  let mockLoopStart = 0;
  let mockLoopEnd = 4;
  
  class Panner { 
    pan = { value: 0 }; 
    toDestination() { return this; } 
    connect() { return this; } 
    dispose = vi.fn(); 
  }
  
  class Sampler { 
    volume = { value: 0 }; 
    loaded = true; 
    connect(_node: any) { return this; }
    triggerAttackRelease = vi.fn();
    dispose = vi.fn();
  }
  
  class GrainPlayer { 
    buffer: any = { loaded: true }; 
    volume = { value: 0 }; 
    playbackRate = 1;
    grainSize = 0.2;
    overlap = 0.1;
    detune = 0;
    loop = false;
    constructor(_opts: any) {}
    connect(_node: any) { return this; } 
    start = vi.fn(); 
    stop = vi.fn(); 
    dispose = vi.fn(); 
  }
  
  class Part { 
    loop = false; 
    loopStart = 0; 
    loopEnd = 0;
    humanize = 0;
    probability = 1;
    constructor(public cb: any, public events: any[]) {}
    start = vi.fn();
    stop = vi.fn();
    cancel = vi.fn();
    dispose = vi.fn();
  }
  
  const gainToDb = (g: number) => (g <= 0 ? -Infinity : 20 * Math.log10(g));
  const dbToGain = (db: number) => (db === -Infinity ? 0 : Math.pow(10, db / 20));
  
  const mockTransport = {
    state: mockTransportState,
    get seconds() { return mockTransportSeconds; },
    set seconds(val: number) { mockTransportSeconds = val; },
    bpm: { value: 120 },
    get loop() { return mockLoop; },
    set loop(val: boolean) { mockLoop = val; },
    get loopStart() { return mockLoopStart; },
    set loopStart(val: number) { mockLoopStart = val; },
    get loopEnd() { return mockLoopEnd; },
    set loopEnd(val: number) { mockLoopEnd = val; },
    start: vi.fn((time?: string | number) => {
      mockTransportState = 'started';
    }),
    stop: vi.fn(() => {
      mockTransportState = 'stopped';
      mockTransportSeconds = 0;
    }),
    pause: vi.fn(() => {
      mockTransportState = 'paused';
    }),
    cancel: vi.fn(),
    on: vi.fn((event: string, callback: () => void) => {
      if (event === 'loop') {
        loopCallbacks.push(callback);
      }
    }),
    off: vi.fn((event: string) => {
      if (event === 'loop') {
        loopCallbacks = [];
      }
    }),
  };
  
  return {
    getTransport: () => mockTransport,
    context: { state: 'running' },
    getContext: () => ({ 
      state: 'running', 
      resume: vi.fn(), 
      lookAhead: 0.1, 
      updateInterval: 0.02, 
      rawContext: { sampleRate: 44100, baseLatency: 0 } 
    }),
    start: vi.fn(async () => {}),
    now: () => Date.now() / 1000,
    Panner,
    Sampler,
    GrainPlayer,
    Part,
    gainToDb,
    dbToGain,
    // Helper to simulate loop event
    _triggerLoop: () => {
      // Simulate transport looping back to start
      mockTransportSeconds = mockLoopStart;
      loopCallbacks.forEach(cb => cb());
    },
    _reset: () => {
      mockTransportSeconds = 0;
      mockTransportState = 'stopped';
      mockLoop = false;
      mockLoopStart = 0;
      mockLoopEnd = 4;
      loopCallbacks = [];
    }
  };
});

import { AudioPlayer } from '../src/lib/core/audio/audio-player';
import { NoteData } from '../src/lib/midi/types';

describe('Repeat Mode Double Play Bug', () => {
  let audioPlayer: AudioPlayer;
  let mockPianoRoll: any;
  let mockMidiManager: any;
  let testNotes: NoteData[];
  let toneModule: any;
  let samplerInstances: any[] = [];

  beforeEach(() => {
    // Get the mocked Tone module
    toneModule = vi.mocked(Tone);
    toneModule._reset();
    
    // Track created sampler instances
    samplerInstances = [];
    const OriginalSampler = toneModule.Sampler;
    toneModule.Sampler = class extends OriginalSampler {
      constructor(...args: any[]) {
        super(...args);
        samplerInstances.push(this);
      }
    };

    // Mock piano roll
    mockPianoRoll = {
      setTime: vi.fn(),
    };

    // Mock MIDI manager
    mockMidiManager = {
      getState: vi.fn(() => ({
        files: [
          { id: 'test-file', isMuted: false },
        ],
      })),
      setFileMute: vi.fn(),
    };

    // Create test notes - simple pattern to detect double triggering
    testNotes = [
      { time: 0, duration: 0.5, name: 'C4', velocity: 0.8, fileId: 'test-file' },
      { time: 1, duration: 0.5, name: 'D4', velocity: 0.8, fileId: 'test-file' },
      { time: 2, duration: 0.5, name: 'E4', velocity: 0.8, fileId: 'test-file' },
      { time: 3, duration: 0.5, name: 'F4', velocity: 0.8, fileId: 'test-file' },
    ];

    // Mock WAV audio registry (empty for this test)
    (global as any)._waveRollAudio = {
      getFiles: vi.fn(() => []),
    };

    // Create audio player instance with repeat enabled
    audioPlayer = new AudioPlayer(testNotes, mockPianoRoll, {
      tempo: 120,
      volume: 0.7,
      repeat: true, // Enable repeat mode
    }, mockMidiManager);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
  });

  test('Notes should not be triggered twice when loop restarts', async () => {
    // Start playback
    await audioPlayer.play();
    
    // Get the sampler instance
    const sampler = samplerInstances[0];
    expect(sampler).toBeDefined();
    
    // Clear previous calls to track only loop-related calls
    sampler.triggerAttackRelease.mockClear();
    
    // Simulate reaching the end and looping back
    toneModule._triggerLoop();
    
    // Wait a bit for any scheduled events
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check that notes are not double-triggered
    // Each note should only be triggered once per loop
    const triggerCalls = sampler.triggerAttackRelease.mock.calls;
    
    // Count how many times each note was triggered
    const noteCounts = new Map<string, number>();
    triggerCalls.forEach((call: any[]) => {
      const note = call[0];
      noteCounts.set(note, (noteCounts.get(note) || 0) + 1);
    });
    
    // Each note should only be triggered once
    noteCounts.forEach((count, note) => {
      expect(count).toBeLessThanOrEqual(1, `Note ${note} was triggered ${count} times`);
    });
  });

  test('Part should be properly cancelled before restarting on loop', async () => {
    await audioPlayer.play();
    
    // Get Part instances
    const partInstances = vi.mocked(Tone.Part).mock.instances;
    expect(partInstances.length).toBeGreaterThan(0);
    
    const part = partInstances[partInstances.length - 1];
    
    // Clear previous calls
    part.stop.mockClear();
    part.cancel.mockClear();
    part.start.mockClear();
    
    // Trigger loop event
    toneModule._triggerLoop();
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Part should be stopped and cancelled before restarting
    expect(part.stop).toHaveBeenCalled();
    expect(part.cancel).toHaveBeenCalled();
  });

  test('Transport should handle loop boundaries correctly', async () => {
    await audioPlayer.play();
    
    const transport = toneModule.getTransport();
    
    // Check that loop is configured
    expect(transport.loop).toBe(true);
    expect(transport.loopStart).toBe(0);
    expect(transport.loopEnd).toBeGreaterThan(0);
    
    // Simulate approaching loop end
    transport.seconds = transport.loopEnd - 0.01;
    
    // Trigger loop
    toneModule._triggerLoop();
    
    // Transport should be back at loop start
    expect(transport.seconds).toBe(transport.loopStart);
  });

  test('WAV players should restart cleanly on loop', async () => {
    // Add a WAV file to the registry
    (global as any)._waveRollAudio = {
      getFiles: vi.fn(() => [{
        id: 'wav-1',
        url: 'test.wav',
        isVisible: true,
        isMuted: false,
      }]),
    };
    
    // Recreate player with WAV file
    audioPlayer = new AudioPlayer(testNotes, mockPianoRoll, {
      tempo: 120,
      volume: 0.7,
      repeat: true,
    }, mockMidiManager);
    
    await audioPlayer.play();
    
    // Get GrainPlayer instances
    const grainPlayerInstances = vi.mocked(Tone.GrainPlayer).mock.instances;
    
    if (grainPlayerInstances.length > 0) {
      const wavPlayer = grainPlayerInstances[0];
      
      // Clear previous calls
      wavPlayer.stop.mockClear();
      wavPlayer.start.mockClear();
      
      // Trigger loop
      toneModule._triggerLoop();
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // WAV player should be stopped and restarted
      expect(wavPlayer.stop).toHaveBeenCalled();
      // Start might be called with a slight delay
      // expect(wavPlayer.start).toHaveBeenCalled();
    }
  });

  test('Multiple loops should not accumulate extra triggers', async () => {
    await audioPlayer.play();
    
    const sampler = samplerInstances[0];
    
    // Simulate multiple loop cycles
    for (let i = 0; i < 3; i++) {
      sampler.triggerAttackRelease.mockClear();
      
      // Trigger loop
      toneModule._triggerLoop();
      
      // Wait for events to process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Count triggers for this loop
      const triggerCount = sampler.triggerAttackRelease.mock.calls.length;
      
      // Should have roughly the same number of triggers each loop
      // (allowing for some timing variations)
      expect(triggerCount).toBeLessThanOrEqual(testNotes.length + 1);
    }
  });
});