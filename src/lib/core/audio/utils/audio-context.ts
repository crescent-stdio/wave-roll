/**
 * Audio Context Configuration Utilities
 */

import * as Tone from "tone";

/**
 * Configure audio context for optimal performance
 */
export async function configureAudioContext(): Promise<void> {
  // Ensure audio context is started
  if (Tone.getContext().state !== "running") {
    await Tone.start();
  }

  // Set optimal lookahead time for smooth playback
  // Lookahead determines how far in advance events are scheduled
  const ctxAny = Tone.getContext() as any;
  ctxAny.lookAhead = 0.1; // 100ms lookahead

  // Update interval for the Web Audio clock (not always typed on BaseContext)
  // Lower values = more accurate timing but higher CPU usage
  ctxAny.updateInterval = 0.02; // 20ms update interval

  // Set latency hint for better performance
  // 'playback' optimizes for smooth playback vs 'interactive' for low latency
  if (Tone.getContext().rawContext) {
    const audioContext: any = Tone.getContext().rawContext as any;
    if (audioContext && audioContext.baseLatency !== undefined) {
      // Use playback mode for smoother audio without glitches
      audioContext.latencyHint = "playback";
    }
  }
}

/**
 * Get recommended buffer size based on system capabilities
 */
export function getOptimalBufferSize(): number {
  const context = Tone.getContext().rawContext;
  if (!context) return 512;

  // Larger buffer = more stable but higher latency
  // Smaller buffer = lower latency but more prone to glitches
  const sampleRate = context.sampleRate;
  
  // Use larger buffers for higher sample rates
  if (sampleRate >= 48000) {
    return 1024;
  } else if (sampleRate >= 44100) {
    return 512;
  } else {
    return 256;
  }
}

/**
 * Ensure audio context is running and optimized
 */
export async function ensureAudioContextReady(): Promise<void> {
  try {
    const anyTone = Tone as unknown as { getContext?: () => any; start?: () => Promise<void> };
    if (!anyTone.getContext) {
      // Minimal fallback for test environments with partial Tone mocks
      if (anyTone.start) {
        try { await anyTone.start(); } catch {}
      }
      return;
    }

    const context = anyTone.getContext!();
    // Resume if suspended
    if (context?.state === "suspended" && typeof context.resume === 'function') {
      await context.resume();
    }
    // Start if not running
    if (context?.state !== "running" && anyTone.start) {
      await anyTone.start();
    }
    // Apply optimal configuration (best-effort)
    try { await configureAudioContext(); } catch {}
  } catch {
    // Ignore configuration errors in non-browser/test environments
  }
}
