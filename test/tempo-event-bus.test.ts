/**
 * Unit tests for TempoEventBus
 * Tests the late subscriber pattern.
 *
 * Note: First-file policy for originalTempo is handled by VisualizationEngine,
 * not by TempoEventBus. The bus always stores the latest tempo.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// We need to reset the module between tests to get a fresh singleton
let tempoEventBus: any;

describe("TempoEventBus", () => {
  beforeEach(async () => {
    // Reset modules to get fresh singleton state
    vi.resetModules();
    const module = await import("../src/lib/core/midi/tempo-event-bus");
    tempoEventBus = module.tempoEventBus;
    tempoEventBus.reset();
  });

  it("should emit tempo to active subscribers", () => {
    const callback = vi.fn();
    tempoEventBus.subscribe(callback);

    tempoEventBus.emit(140, "file-1");

    expect(callback).toHaveBeenCalledWith(140, "file-1");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should deliver stored tempo to late subscribers (race condition fix)", () => {
    // Emit BEFORE subscribing (simulates MIDI load before VisualizationEngine ready)
    tempoEventBus.emit(96, "file-early");

    // Subscribe AFTER emit (late subscriber)
    const lateCallback = vi.fn();
    tempoEventBus.subscribe(lateCallback);

    // Should receive the previously emitted value immediately
    expect(lateCallback).toHaveBeenCalledWith(96, "file-early");
    expect(lateCallback).toHaveBeenCalledTimes(1);
  });

  it("should always store the latest tempo (no first-file policy in bus)", () => {
    const callback = vi.fn();
    tempoEventBus.subscribe(callback);

    // First file
    tempoEventBus.emit(80, "chopin.mid");
    expect(callback).toHaveBeenCalledWith(80, "chopin.mid");

    // Second file - should update stored tempo
    tempoEventBus.emit(140, "jazz.mid");
    expect(callback).toHaveBeenCalledWith(140, "jazz.mid");

    // Late subscriber should receive the LATEST tempo (not first)
    const lateCallback = vi.fn();
    tempoEventBus.subscribe(lateCallback);
    expect(lateCallback).toHaveBeenCalledWith(140, "jazz.mid");
  });

  it("should return unsubscribe function that removes listener", () => {
    const callback = vi.fn();
    const unsubscribe = tempoEventBus.subscribe(callback);

    tempoEventBus.emit(120, "file-1");
    expect(callback).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsubscribe();

    // Should not receive further events
    tempoEventBus.emit(140, "file-2");
    expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
  });

  it("should return last tempo via getLastTempo()", () => {
    expect(tempoEventBus.getLastTempo()).toBeNull();

    tempoEventBus.emit(88, "test-file");
    expect(tempoEventBus.getLastTempo()).toBe(88);

    // Should update on subsequent emits
    tempoEventBus.emit(75, "another-file");
    expect(tempoEventBus.getLastTempo()).toBe(75);
  });

  it("should reset state correctly", () => {
    tempoEventBus.emit(100, "file-1");
    expect(tempoEventBus.getLastTempo()).toBe(100);

    tempoEventBus.reset();
    expect(tempoEventBus.getLastTempo()).toBeNull();

    // After reset, new emit should store tempo
    tempoEventBus.emit(200, "new-file");
    const callback = vi.fn();
    tempoEventBus.subscribe(callback);
    expect(callback).toHaveBeenCalledWith(200, "new-file");
  });
});
