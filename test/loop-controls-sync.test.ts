/**
 * Loop Controls Synchronization Tests
 * 
 * Tests for verifying A-B loop control behavior including:
 * - UI updates when setting A/B points during playback
 * - Position preservation when clearing loop points
 * - Correct jumping behavior when enabling loop mode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createCoreLoopControls } from "../src/lib/core/controls/loop-controls";
import type { PianoRoll } from "../src/lib/core/visualization/piano-roll";
import * as Tone from "tone";

// Mock DOM environment
const createMockElement = () => ({
  style: { cssText: "" },
  textContent: "",
  innerHTML: "",
  onclick: null as any,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  appendChild: vi.fn(),
  append: vi.fn(),
  querySelector: vi.fn(),
  querySelectorAll: vi.fn(() => []),
  click: vi.fn(),
  dataset: {},
  setAttribute: vi.fn(),
  getAttribute: vi.fn(),
  classList: {
    add: vi.fn(),
    remove: vi.fn(),
    contains: vi.fn(),
  },
  title: "",
  disabled: false,
});

global.document = {
  createElement: vi.fn(() => createMockElement()),
  getElementById: vi.fn(),
  head: {
    appendChild: vi.fn(),
  },
} as any;

// Mock Tone.js
vi.mock("tone", () => ({
  getTransport: vi.fn(() => ({
    seconds: 0,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    bpm: { value: 120 },
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    on: vi.fn(),
    off: vi.fn(),
    position: "0:0:0",
  })),
  start: vi.fn(),
  now: vi.fn(() => 0),
  Part: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    clear: vi.fn(),
    add: vi.fn(),
    dispose: vi.fn(),
  })),
  Sampler: vi.fn(() => ({
    toDestination: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      dispose: vi.fn(),
    })),
    triggerAttackRelease: vi.fn(),
    dispose: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    volume: { value: 0 },
  })),
  Panner: vi.fn(() => ({
    pan: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    dispose: vi.fn(),
  })),
  Volume: vi.fn(() => ({
    volume: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    toDestination: vi.fn(),
    dispose: vi.fn(),
  })),
  Player: vi.fn(() => ({
    toDestination: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
    playbackRate: 1,
    volume: { value: 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
    loaded: true,
    buffer: { duration: 10 },
    sync: vi.fn(),
    unsync: vi.fn(),
  })),
  getContext: vi.fn(() => ({
    resume: vi.fn(),
    state: "running",
  })),
  Time: vi.fn((value) => ({
    toSeconds: vi.fn(() => typeof value === 'string' ? 0 : value),
  })),
  Buffer: vi.fn(() => ({
    duration: 10,
  })),
  Destination: {
    volume: { value: 0 },
  },
}));

describe("Loop Controls Synchronization", () => {
  let audioPlayer: any;
  let pianoRoll: PianoRoll;
  let loopControls: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock PianoRoll
    pianoRoll = {
      setTime: vi.fn(),
      setLoopWindow: vi.fn(),
      getTime: vi.fn(() => 0),
    } as any;

    // Initialize minimal engine mock
    audioPlayer = {
      getState: vi.fn(() => ({
        isPlaying: false,
        currentTime: 0,
        duration: 10,
        playbackRate: 100,
      })),
      toggleRepeat: vi.fn(),
      setLoopPoints: vi.fn(),
      seek: vi.fn(),
      play: vi.fn(),
      destroy: vi.fn(),
    };

    // Create loop controls
    loopControls = createCoreLoopControls({
      audioPlayer,
      pianoRoll,
    });
  });

  afterEach(() => {
    audioPlayer?.destroy?.();
  });

  describe("A button behavior during playback", () => {
    it("should update UI immediately when A is clicked during playback", async () => {
      // Start playback
      audioPlayer.play();
      
      // Set state to playing at 2 seconds
      const state = audioPlayer.getState();
      state.isPlaying = true;
      state.currentTime = 2;
      state.duration = 10;
      
      // Find and click A button
      const btnA = (global.document.createElement as any).mock.results
        .find((r: any) => r.value.textContent === "A")?.value;
      
      if (btnA && btnA.onclick) {
        btnA.onclick();
      }

      // Verify pianoRoll.setTime was called with the current time
      expect(pianoRoll.setTime).toHaveBeenCalledWith(2);
      
      // Verify visual state update
      expect(btnA.dataset.active).toBe("true");
      expect(btnA.style.background).toContain("#");
    });

    it("should preserve position when A is clicked while not playing", () => {
      // Set state to not playing at 3 seconds
      const state = audioPlayer.getState();
      state.isPlaying = false;
      state.currentTime = 3;
      state.duration = 10;
      
      // Find and click A button
      const btnA = (global.document.createElement as any).mock.results
        .find((r: any) => r.value.textContent === "A")?.value;
      
      if (btnA && btnA.onclick) {
        btnA.onclick();
      }

      // Verify position is preserved (only visual update)
      expect(pianoRoll.setTime).toHaveBeenCalledWith(3);
      expect(btnA.dataset.active).toBe("true");
    });
  });

  describe("Clear button behavior", () => {
    it("should preserve current position when clearing during playback", () => {
      // Set up loop points
      const state = audioPlayer.getState();
      state.isPlaying = true;
      state.currentTime = 5;
      state.duration = 10;
      
      // Find buttons
      const buttons = (global.document.createElement as any).mock.results;
      const btnA = buttons.find((r: any) => r.value.textContent === "A")?.value;
      const btnB = buttons.find((r: any) => r.value.textContent === "B")?.value;
      const btnClear = buttons.find((r: any) => r.value.textContent === "✕")?.value;
      
      // Set A and B points
      if (btnA?.onclick) {
        state.currentTime = 2;
        btnA.onclick();
      }
      if (btnB?.onclick) {
        state.currentTime = 7;
        btnB.onclick();
      }
      
      // Clear while at position 5
      state.currentTime = 5;
      const setLoopPointsSpy = vi.spyOn(audioPlayer, 'setLoopPoints');
      
      if (btnClear?.onclick) {
        btnClear.onclick();
      }
      
      // Verify setLoopPoints was called with preservePosition=true
      expect(setLoopPointsSpy).toHaveBeenCalledWith(null, null, true);
      
      // Verify A and B buttons are reset
      expect(btnA.dataset.active).toBe("");
      expect(btnB.dataset.active).toBe("");
    });
  });

  describe("Loop restart button behavior", () => {
    it("should be disabled until both A and B are set with B > A", () => {
      const buttons = (global.document.createElement as any).mock.results;
      const btnLoopRestart = buttons.find((r: any) => 
        r.value.innerHTML?.includes && r.value.innerHTML.includes("svg"))?.value;

      // Initially disabled
      expect(btnLoopRestart.disabled).toBe(true);
      expect(btnLoopRestart.setAttribute).toHaveBeenCalledWith("aria-disabled", "true");

      // Set only A -> remains disabled
      const btnA = buttons.find((r: any) => r.value.textContent === "A")?.value;
      const state = audioPlayer.getState();
      state.currentTime = 2;
      if (btnA?.onclick) btnA.onclick();
      expect(btnLoopRestart.disabled).toBe(true);

      // Set only B (A already set) -> now enabled
      const btnB = buttons.find((r: any) => r.value.textContent === "B")?.value;
      state.currentTime = 6;
      if (btnB?.onclick) btnB.onclick();
      expect(btnLoopRestart.disabled).toBe(false);
      expect(btnLoopRestart.setAttribute).toHaveBeenCalledWith("aria-disabled", "false");
    });
    it("should jump to A point when enabling loop during playback", () => {
      const state = audioPlayer.getState();
      state.isPlaying = true;
      state.currentTime = 5;
      state.duration = 10;
      
      const buttons = (global.document.createElement as any).mock.results;
      const btnA = buttons.find((r: any) => r.value.textContent === "A")?.value;
      const btnLoopRestart = buttons.find((r: any) => 
        r.value.innerHTML?.includes && r.value.innerHTML.includes("svg"))?.value;
      
      // Set A point at 2 seconds
      if (btnA?.onclick) {
        state.currentTime = 2;
        btnA.onclick();
      }
      
      // Enable loop mode
      const seekSpy = vi.spyOn(audioPlayer, 'seek');
      const playeSpy = vi.spyOn(audioPlayer, 'play');
      
      if (btnLoopRestart?.onclick) {
        btnLoopRestart.onclick();
      }
      
      // Should seek to A point (2 seconds)
      expect(seekSpy).toHaveBeenCalledWith(2);
      
      // Should be in active state
      expect(btnLoopRestart.dataset.active).toBe("true");
    });

    it("should jump to A when clicking loop with both A and B set", () => {
      const state = audioPlayer.getState();
      state.isPlaying = false;
      state.currentTime = 0;
      state.duration = 10;
      
      const buttons = (global.document.createElement as any).mock.results;
      const btnA = buttons.find((r: any) => r.value.textContent === "A")?.value;
      const btnB = buttons.find((r: any) => r.value.textContent === "B")?.value;
      const btnLoopRestart = buttons.find((r: any) => 
        r.value.innerHTML?.includes && r.value.innerHTML.includes("svg"))?.value;
      
      // Set A at 3, B at 7
      if (btnA?.onclick) {
        state.currentTime = 3;
        btnA.onclick();
      }
      if (btnB?.onclick) {
        state.currentTime = 7;
        btnB.onclick();
      }
      
      // Enable loop
      const seekSpy = vi.spyOn(audioPlayer, 'seek');
      const setLoopPointsSpy = vi.spyOn(audioPlayer, 'setLoopPoints');
      
      if (btnLoopRestart?.onclick) {
        btnLoopRestart.onclick();
      }
      
      // Should set loop points without preserving position (jump to start)
      expect(setLoopPointsSpy).toHaveBeenCalledWith(3, 7, false);
      expect(seekSpy).toHaveBeenCalledWith(3);
    });

    it("should turn off loop restart when Clear (X) is pressed", () => {
      const state = audioPlayer.getState();
      state.isPlaying = true;
      state.currentTime = 0;
      state.duration = 10;

      const buttons = (global.document.createElement as any).mock.results;
      const btnA = buttons.find((r: any) => r.value.textContent === "A")?.value;
      const btnB = buttons.find((r: any) => r.value.textContent === "B")?.value;
      const btnLoopRestart = buttons.find((r: any) => 
        r.value.innerHTML?.includes && r.value.innerHTML.includes("svg"))?.value;
      const btnClear = buttons.find((r: any) => r.value.textContent === "✕")?.value;

      // Set A and B to enable loop
      if (btnA?.onclick) { state.currentTime = 2; btnA.onclick(); }
      if (btnB?.onclick) { state.currentTime = 6; btnB.onclick(); }
      expect(btnLoopRestart.disabled).toBe(false);

      // Turn on loop restart
      if (btnLoopRestart?.onclick) { btnLoopRestart.onclick(); }
      expect(btnLoopRestart.dataset.active).toBe("true");

      // Press clear (X) should turn off loop and disable button
      const toggleRepeatSpy = vi.spyOn(audioPlayer, 'toggleRepeat');
      if (btnClear?.onclick) { btnClear.onclick(); }

      expect(btnLoopRestart.dataset.active).toBeUndefined();
      expect(btnLoopRestart.disabled).toBe(true);
      expect(toggleRepeatSpy).toHaveBeenCalledWith(false);
    });
  });

  describe("Loop window updates", () => {
    it("should dispatch loop-update event when setting points", () => {
      const state = audioPlayer.getState();
      state.currentTime = 2;
      state.duration = 10;
      state.playbackRate = 100;
      
      const dispatchSpy = vi.fn();
      loopControls.element.dispatchEvent = dispatchSpy;
      
      const btnA = (global.document.createElement as any).mock.results
        .find((r: any) => r.value.textContent === "A")?.value;
      
      if (btnA?.onclick) {
        btnA.onclick();
      }
      
      // Should dispatch custom event with loop window data
      expect(dispatchSpy).toHaveBeenCalled();
      const event = dispatchSpy.mock.calls[0][0];
      expect(event.type).toBe("wr-loop-update");
      expect(event.detail.loopWindow).toBeDefined();
    });

    it("should handle B-only loop correctly", () => {
      const state = audioPlayer.getState();
      state.currentTime = 5;
      state.duration = 10;
      
      const btnB = (global.document.createElement as any).mock.results
        .find((r: any) => r.value.textContent === "B")?.value;
      
      if (btnB?.onclick) {
        btnB.onclick();
      }
      
      // Verify B is set without A
      expect(btnB.dataset.active).toBe("true");
      expect(pianoRoll.setLoopWindow).toHaveBeenCalled();
    });
  });
});