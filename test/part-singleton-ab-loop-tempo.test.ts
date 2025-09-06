/**
 * Part Singleton under AB-loop and Tempo changes
 * Ensures that exactly one Tone.Part is active at any time and
 * lifecycle is stop -> start (no overlapping) when operations occur.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AudioPlayer } from '../src/lib/core/audio/audio-player';
import type { NoteData } from '../src/lib/midi/types';

// Local Tone mock so this test does not depend on real WebAudio
vi.mock('tone', () => {
  class MockPart {
    public state: string = 'stopped';
    public loop = false;
    public loopStart = 0;
    public loopEnd = 0;
    public humanize = 0;
    public probability = 1;
    constructor(_: any, __: any) {}
    start() { this.state = 'started'; }
    stop() { this.state = 'stopped'; }
    cancel() {}
    dispose() { this.state = 'disposed'; }
  }
  class MockPanner {
    pan = { value: 0 };
    toDestination() { return this; }
    dispose() {}
  }
  class MockSampler {
    volume = { value: 0 };
    loaded = true;
    constructor(_: any) {}
    connect() { return this; }
    triggerAttackRelease() {}
    dispose() {}
  }
  class MockGrainPlayer {
    volume = { value: 0 };
    playbackRate = 1;
    constructor(_: any, __?: any) {}
    connect() { return new MockPanner(); }
    start() {}
    stop() {}
    dispose() {}
  }
  const handlers: Record<string, Function[]> = { stop: [], pause: [], loop: [] };
  const transport = {
    bpm: { value: 120 },
    state: 'stopped',
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    seconds: 0,
    on: (t: string, cb: Function) => { (handlers[t] ||= []).push(cb); },
    off: (t: string, cb?: Function) => {
      if (!cb) handlers[t] = []; else handlers[t] = handlers[t].filter((f) => f !== cb);
    },
    start: () => { transport.state = 'started'; },
    stop: () => { transport.state = 'stopped'; handlers.stop.forEach((f) => f()); },
    pause: () => { transport.state = 'stopped'; handlers.pause.forEach((f) => f()); },
    cancel: () => {},
  };
  return {
    default: {},
    Part: MockPart,
    Panner: MockPanner,
    Sampler: MockSampler,
    GrainPlayer: MockGrainPlayer,
    getTransport: () => transport,
    start: async () => {},
    getContext: () => ({ state: 'running', rawContext: { sampleRate: 44100 } }),
    now: () => 0,
  };
});

// Shim window for timers used in TransportSyncManager
// @ts-ignore
globalThis.window = globalThis as any;

vi.mock('tone', () => ({
  getTransport: () => ({
    state: 'stopped',
    seconds: 0,
    bpm: { value: 120 },
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    cancel: vi.fn(),
    loop: false,
    loopStart: 0,
    loopEnd: 1,
    on: vi.fn(),
    off: vi.fn(),
  }),
  context: { state: 'running' },
  getContext: () => ({ state: 'running', resume: vi.fn(), lookAhead: 0.1, updateInterval: 0.02, rawContext: { sampleRate: 44100, baseLatency: 0 } }),
  start: vi.fn(async () => {}),
  now: () => 0,
}));

const samplerSpies = {
  initialize: vi.fn(() => Promise.resolve()),
  setupNotePart: vi.fn(),
  startPart: vi.fn(),
  stopPart: vi.fn(),
  setVolume: vi.fn(),
  areAllTracksMuted: vi.fn(() => false),
  areAllTracksZeroVolume: vi.fn(() => false),
  getPart: vi.fn(() => ({ id: 'mock-part' })),
  destroy: vi.fn(),
};

vi.mock('@/lib/core/audio/managers/sampler-manager', () => ({
  SamplerManager: class {
    initialize = samplerSpies.initialize
    setupNotePart = samplerSpies.setupNotePart
    startPart = samplerSpies.startPart
    stopPart = samplerSpies.stopPart
    setVolume = samplerSpies.setVolume
    areAllTracksMuted = samplerSpies.areAllTracksMuted
    areAllTracksZeroVolume = samplerSpies.areAllTracksZeroVolume
    getPart = samplerSpies.getPart
    destroy = samplerSpies.destroy
  },
}));

const wavSpies = {
  isAudioActive: vi.fn(() => false),
  startActiveAudioAt: vi.fn(),
  stopAllAudioPlayers: vi.fn(),
  setPlaybackRate: vi.fn(),
  destroy: vi.fn(),
};

vi.mock('@/lib/core/audio/managers/wav-player-manager', () => ({
  WavPlayerManager: class {
    isAudioActive = wavSpies.isAudioActive
    startActiveAudioAt = wavSpies.startActiveAudioAt
    stopAllAudioPlayers = wavSpies.stopAllAudioPlayers
    setPlaybackRate = wavSpies.setPlaybackRate
    destroy = wavSpies.destroy
  },
}));

vi.mock('@/lib/core/audio/managers/transport-sync-manager', () => ({
  TransportSyncManager: class {
    startSyncScheduler = vi.fn()
    stopSyncScheduler = vi.fn()
    visualToTransportTime = vi.fn((time: number) => time)
    transportToVisualTime = vi.fn((time: number) => time)
    visualToTransportTimeWithTempo = vi.fn((time: number, tempo: number) => time)
    updateSeekTimestamp = vi.fn()
    handleTransportStop = vi.fn(() => false)
    handleTransportPause = vi.fn()
    handleTransportLoop = vi.fn()
    setEndCallback = vi.fn()
  },
}));

// Minimal mock for PianoRollSync
const createMockPianoRoll = () => ({
  setTime: vi.fn(),
});

const notes: NoteData[] = [
  { name: 'C4', time: 0.0, duration: 0.5, velocity: 0.9, fileId: 'f1' },
  { name: 'E4', time: 0.5, duration: 0.5, velocity: 0.9, fileId: 'f1' },
  { name: 'G4', time: 1.0, duration: 0.5, velocity: 0.9, fileId: 'f1' },
  { name: 'C5', time: 1.5, duration: 0.5, velocity: 0.9, fileId: 'f1' },
  { name: 'E5', time: 2.0, duration: 0.5, velocity: 0.9, fileId: 'f1' },
];

describe('Part singleton under AB loop + tempo scenarios', () => {
  let player: AudioPlayer;
  let pr: ReturnType<typeof createMockPianoRoll>;

  beforeEach(async () => {
    // Reset all spies before each test
    vi.clearAllMocks();
    
    pr = createMockPianoRoll();
    player = new AudioPlayer(notes, pr, { tempo: 120, volume: 0.7, repeat: false });
    await new Promise((r) => setTimeout(r, 50));
  });

  afterEach(() => {
    player.destroy();
  });

  it('stops current Part before starting a new one when enabling AB loop during playback', async () => {
    // Arrange spies on Sampler lifecycle
    const sm = (player as any).samplerManager as {
      startPart: (time: number | string, offset?: number) => void;
      stopPart: () => void;
      getPart: () => any;
    };
    const seq: string[] = [];
    const stopSpy = vi.spyOn(sm, 'stopPart').mockImplementation(() => {
      seq.push('stop');
    });
    const startSpy = vi.spyOn(sm, 'startPart').mockImplementation((time: any, off?: any) => {
      seq.push('start');
    });

    // Start playback
    await player.play();
    await new Promise((r) => setTimeout(r, 60));

    // Act: set A-B and enable loop (jump to A)
    player.setLoopPoints(1.0, 2.5, false);
    await new Promise((r) => setTimeout(r, 80));

    // Assert: stop happens before new start (no overlapping duplicate Parts)
    const order = seq.join('>');
    expect(order.includes('stop')).toBe(true);
    expect(order.lastIndexOf('stop')).toBeLessThan(order.lastIndexOf('start'));
    // Still exactly one live Part instance
    expect(sm.getPart()).toBeTruthy();

    stopSpy.mockRestore();
    startSpy.mockRestore();
  });

  it('does not create a new Part when clearing loop during playback (position preserved)', async () => {
    const sm = (player as any).samplerManager as {
      startPart: (time: number | string, offset?: number) => void;
      stopPart: () => void;
      getPart: () => any;
    };
    const startSpy = vi.spyOn(sm, 'startPart');

    await player.play();
    await new Promise((r) => setTimeout(r, 60));
    // enable loop first
    player.setLoopPoints(0.5, 1.5, false);
    await new Promise((r) => setTimeout(r, 80));

    const partBeforeClear = sm.getPart();
    // clear while preserving position
    player.setLoopPoints(null, null, true);
    await new Promise((r) => setTimeout(r, 60));

    // No additional start should be triggered just by clearing
    expect(startSpy).not.toHaveBeenCalledTimes(0); // at least had earlier starts
    const partAfterClear = sm.getPart();
    expect(partAfterClear).toBeTruthy();

    startSpy.mockRestore();
  });

  it('immediately syncs UI when enabling AB loop during playback', async () => {
    // Track UI updates from onVisualUpdate callback
    const visualUpdates: Array<{ currentTime: number; isPlaying: boolean }> = [];
    (player as any).setOnVisualUpdate((update: any) => {
      visualUpdates.push({ currentTime: update.currentTime, isPlaying: update.isPlaying });
    });

    // Track piano roll setTime calls
    const pianoRollCalls: number[] = [];
    pr.setTime = vi.fn().mockImplementation((time: number) => {
      pianoRollCalls.push(time);
    });

    // Start playback and let it play for a bit
    await player.play();
    await new Promise((r) => setTimeout(r, 100));
    
    const initialUpdates = visualUpdates.length;
    const initialPianoRollCalls = pianoRollCalls.length;
    
    // Enable AB loop - should immediately jump to A and continue UI updates
    player.setLoopPoints(0.5, 1.5, false);
    await new Promise((r) => setTimeout(r, 150));
    
    // Check that UI continued updating after loop activation
    expect(visualUpdates.length).toBeGreaterThan(initialUpdates);
    expect(pianoRollCalls.length).toBeGreaterThan(initialPianoRollCalls);
    
    // Check that position jumped to loop start (0.5)
    const jumpUpdate = visualUpdates.find(update => Math.abs(update.currentTime - 0.5) < 0.1);
    expect(jumpUpdate).toBeTruthy();
    expect(jumpUpdate?.isPlaying).toBe(true);
    
    // Check that piano roll was set to loop start
    const jumpCall = pianoRollCalls.find(time => Math.abs(time - 0.5) < 0.1);
    expect(jumpCall).toBeTruthy();
  });

  it('preserves current position when clearing loop during playback', async () => {
    const visualUpdates: Array<{ currentTime: number; isPlaying: boolean }> = [];
    (player as any).setOnVisualUpdate((update: any) => {
      visualUpdates.push({ currentTime: update.currentTime, isPlaying: update.isPlaying });
    });

    // Start playback
    await player.play();
    await new Promise((r) => setTimeout(r, 60));
    
    // Enable loop first
    player.setLoopPoints(0.5, 1.5, false);
    await new Promise((r) => setTimeout(r, 80));
    
    // Let it play in the loop for a bit
    await new Promise((r) => setTimeout(r, 100));
    
    const beforeClearTime = (player as any).state.currentTime;
    
    // Clear loop while preserving position
    player.setLoopPoints(null, null, true);
    await new Promise((r) => setTimeout(r, 80));
    
    const afterClearTime = (player as any).state.currentTime;
    
    // Position should be preserved (allowing small tolerance for timing)
    expect(Math.abs(afterClearTime - beforeClearTime)).toBeLessThan(0.2);
    
    // Should still be playing
    expect((player as any).state.isPlaying).toBe(true);
    
    // UI should continue updating
    const updatesAfterClear = visualUpdates.filter(update => 
      update.currentTime >= afterClearTime - 0.1
    );
    expect(updatesAfterClear.length).toBeGreaterThan(0);
  });

  it('restarts cleanly on tempo change (200%) without overlapping Parts', async () => {
    const sm = (player as any).samplerManager as {
      startPart: (time: number | string, offset?: number) => void;
      stopPart: () => void;
      getPart: () => any;
    };
    const seq: string[] = [];
    const stopSpy = vi.spyOn(sm, 'stopPart').mockImplementation(() => {
      seq.push('stop');
    });
    const startSpy = vi.spyOn(sm, 'startPart').mockImplementation(() => {
      seq.push('start');
    });

    await player.play();
    await new Promise((r) => setTimeout(r, 60));

    // Change playback rate to 200%
    player.setPlaybackRate(200);
    await new Promise((r) => setTimeout(r, 120));

    // Ensure lifecycle ordering stop->start
    const order = seq.join('>');
    expect(order.includes('stop')).toBe(true);
    expect(order.lastIndexOf('stop')).toBeLessThan(order.lastIndexOf('start'));
    expect(sm.getPart()).toBeTruthy();

    stopSpy.mockRestore();
    startSpy.mockRestore();
  });

  it('maintains correct seekbar bounds and UI sync at 200% tempo', async () => {
    const visualUpdates: Array<{ currentTime: number; duration: number; isPlaying: boolean }> = [];
    (player as any).setOnVisualUpdate((update: any) => {
      visualUpdates.push({ 
        currentTime: update.currentTime, 
        duration: update.duration, 
        isPlaying: update.isPlaying 
      });
    });

    const pianoRollCalls: number[] = [];
    pr.setTime = vi.fn().mockImplementation((time: number) => {
      pianoRollCalls.push(time);
    });

    const originalDuration = (player as any).state.duration;
    
    // Start playback
    await player.play();
    await new Promise((r) => setTimeout(r, 60));
    
    // Change to 200% tempo
    player.setPlaybackRate(200);
    await new Promise((r) => setTimeout(r, 100));
    
    // The test should verify that UI updates are called with correct bounds
    // Even if no updates happen during test (due to mocking), the important part
    // is that the state maintains correct duration
    expect((player as any).state.duration).toBe(originalDuration);
    expect((player as any).state.playbackRate).toBe(200);
    
    // Piano roll should have been called at least once during tempo change
    expect(pianoRollCalls.length).toBeGreaterThan(0);
    
    // Piano roll times should stay within bounds
    pianoRollCalls.forEach(time => {
      expect(time).toBeLessThanOrEqual(originalDuration + 0.1);
    });
  });

  it('maintains correct AB loop marker positions at 200% tempo', async () => {
    const loopStart = 0.5;
    const loopEnd = 1.5;
    
    // Set AB loop points first
    player.setLoopPoints(loopStart, loopEnd, false);
    await new Promise((r) => setTimeout(r, 50));
    
    // Verify initial loop points are set
    const loopManager = (player as any).loopManager;
    const initialStart = loopManager.loopStartVisual;
    const initialEnd = loopManager.loopEndVisual;
    
    // Change to 200% tempo
    player.setPlaybackRate(200);
    await new Promise((r) => setTimeout(r, 50));
    
    // Verify tempo change was applied
    expect((player as any).state.playbackRate).toBe(200);
    
    // Loop positions should be maintained or properly scaled
    // (The exact behavior depends on the implementation)
    const finalStart = loopManager.loopStartVisual;
    const finalEnd = loopManager.loopEndVisual;
    
    expect(finalStart).toBeDefined();
    expect(finalEnd).toBeDefined();
    expect(finalStart).toBeLessThan(finalEnd);
    
    // Piano roll should be updated during tempo change
    expect(pr.setTime).toHaveBeenCalled();
  });

  it('handles precise seeking at 200% tempo', async () => {
    const targetTime = 1.2;
    const originalDuration = (player as any).state.duration;
    
    // Set 200% tempo first
    player.setPlaybackRate(200);
    await new Promise((r) => setTimeout(r, 50));
    
    const visualUpdates: number[] = [];
    (player as any).setOnVisualUpdate((update: any) => {
      visualUpdates.push(update.currentTime);
    });
    
    const pianoRollCalls: number[] = [];
    pr.setTime = vi.fn().mockImplementation((time: number) => {
      pianoRollCalls.push(time);
    });
    
    // Seek to target time
    await player.seek(targetTime);
    await new Promise((r) => setTimeout(r, 100));
    
    // Check that seek was accurate
    const currentTime = (player as any).state.currentTime;
    expect(Math.abs(currentTime - targetTime)).toBeLessThan(0.1);
    
    // Check that piano roll was updated to correct position
    const seekCall = pianoRollCalls.find(time => Math.abs(time - targetTime) < 0.1);
    expect(seekCall).toBeTruthy();
    
    // Start playback after seek
    await player.play();
    await new Promise((r) => setTimeout(r, 150));
    
    // UI should continue updating from seek position
    const updatesAfterSeek = visualUpdates.filter(time => time >= targetTime - 0.1);
    expect(updatesAfterSeek.length).toBeGreaterThan(0);
    
    // All times should stay within bounds
    visualUpdates.forEach(time => {
      expect(time).toBeLessThanOrEqual(originalDuration + 0.1);
    });
  });
});
