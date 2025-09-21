/**
 * Sampler Manager for MIDI playback
 * Handles Tone.js sampler creation, loading, and playback
 */

import * as Tone from "tone";
import { NoteData } from "@/lib/midi/types";
import { DEFAULT_SAMPLE_MAP, AUDIO_CONSTANTS, AudioPlayerState } from "../player-types";
import { clamp } from "../../utils";
import { toDb, fromDb, clamp01, isSilentDb, mixLinear } from "../utils";

export interface SamplerTrack {
  sampler: Tone.Sampler;
  delay: Tone.Delay | null;
  gate: Tone.Gain;
  panner: Tone.Panner;
  muted: boolean;
}

export class SamplerManager {
  /** Legacy single sampler (used for single-file players) */
  private sampler: Tone.Sampler | null = null;
  /** Global panner for legacy single-sampler path */
  private panner: Tone.Panner | null = null;
  /** Hard gate for legacy single-sampler path */
  private gate: Tone.Gain | null = null;
  /** Map of fileId -> {sampler, panner, muted} for multi-file playback */
  private trackSamplers: Map<string, SamplerTrack> = new Map();
  /** Current Tone.Part for scheduling note events */
  private part: Tone.Part | null = null;
  /** Notes to be played */
  private notes: NoteData[];
  /** MIDI manager reference */
  private midiManager: any;
  /** Alignment delay in seconds to compensate downstream (e.g., WAV PitchShift) latency */
  private alignmentDelaySec: number = 0;
  
  constructor(notes: NoteData[], midiManager?: any) {
    this.notes = notes;
    this.midiManager = midiManager;
  }

  // ------------------------------
  // Private helpers (behavior preserved)
  // ------------------------------
  private getTrack(fileId: string): SamplerTrack | null {
    return this.trackSamplers.get(fileId) ?? null;
  }

  private applySamplerVolume(sampler: Tone.Sampler, linear: number): void {
    sampler.volume.value = toDb(clamp01(linear));
  }

  private applyPannerPan(panner: Tone.Panner, pan: number): void {
    panner.pan.value = clamp(pan, -1, 1);
  }

  /** Return notes filtered to intersect the [loopStart, loopEnd) window, or all if window inactive. */
  private filterNotesByLoopWindow(
    notes: NoteData[],
    loopStartVisual?: number | null,
    loopEndVisual?: number | null
  ): NoteData[] {
    if (
      loopStartVisual === undefined ||
      loopEndVisual === undefined ||
      loopStartVisual === null ||
      loopEndVisual === null
    ) {
      return notes;
    }
    return notes.filter((n) => {
      const noteEnd = n.time + n.duration;
      return noteEnd > loopStartVisual && n.time < loopEndVisual;
    });
  }

  /** Compute visual->transport scale factor. */
  private computeScaleToTransport(
    originalTempo?: number,
    tempo?: number
  ): number {
    return originalTempo && tempo ? originalTempo / tempo : 1;
  }

  /** Map notes to Part events without fileId. */
  private notesToEvents(
    notes: NoteData[],
    loopStartVisual: number | null | undefined,
    scaleToTransport: number
  ): Array<{ time: number; note: string; duration: number; velocity: number }> {
    return notes.map((note) => {
      const onset = note.time;
      const duration = note.duration;
      const transportOnset = onset * scaleToTransport;
      const transportDuration = duration * scaleToTransport;
      const relativeTime =
        loopStartVisual !== undefined && loopStartVisual !== null
          ? transportOnset - loopStartVisual * scaleToTransport
          : transportOnset;
      const timeSafe = Math.max(0, relativeTime);
      const durationSafe = Math.max(0, transportDuration);
      return {
        time: timeSafe,
        note: note.name,
        duration: durationSafe,
        velocity: note.velocity,
      };
    });
  }

  /** Map notes to Part events with fileId. */
  private notesToEventsWithFileId(
    notes: NoteData[],
    loopStartVisual: number | null | undefined,
    scaleToTransport: number
  ): Array<{
    time: number;
    note: string;
    duration: number;
    velocity: number;
    fileId: string;
  }> {
    return notes.map((note) => {
      const onset = note.time;
      const duration = note.duration;
      const transportOnset = onset * scaleToTransport;
      const transportDuration = duration * scaleToTransport;
      const relativeTime =
        loopStartVisual !== undefined && loopStartVisual !== null
          ? transportOnset - loopStartVisual * scaleToTransport
          : transportOnset;
      const timeSafe = Math.max(0, relativeTime);
      const durationSafe = Math.max(0, transportDuration);
      return {
        time: timeSafe,
        note: note.name,
        duration: durationSafe,
        velocity: note.velocity,
        fileId: note.fileId || "__default",
      };
    });
  }

  /** Build Tone.Part from events and callback, configure loop settings. */
  private buildPart<T extends { time: number }>(
    events: T[],
    options: { repeat?: boolean; duration?: number; tempo?: number; originalTempo?: number } | undefined,
    callback: (time: number, event: T) => void
  ): void {
    // Dispose of existing part to prevent memory leak and double triggering
    if (this.part) {
      this.part.stop(0);
      this.part.cancel();
      this.part.dispose();
      this.part = null;
    }
    
    this.part = new Tone.Part(callback as any, events as any);
    // Important: do NOT enable Part.loop. We explicitly handle Transport
    // loop events in AudioPlayer.handleTransportLoop() by cancelling and
    // restarting the Part at the loop start. Enabling Part.loop here would
    // cause double scheduling (Part's own loop + manual restart) and lead to
    // double playback (audible overlap).
    this.part.loop = false;
    this.part.loopStart = 0;
    // Align loopEnd with the same time space as event.time (transport seconds).
    // When tempo != originalTempo, convert visual duration to transport duration.
    const durVisual = options?.duration || 0;
    const tempo = options?.tempo;
    const original = options?.originalTempo;
    const scale = original && tempo ? original / tempo : 1;
    this.part.loopEnd = durVisual * scale;
    // Add slight humanization to reduce mechanical sound
    this.part.humanize = 0.005; // 5ms humanization
    // Ensure all notes play (no probability dropping)
    this.part.probability = 1;
  }

  /**
   * Initialize samplers - either multi-track or legacy single sampler
   */
  async initialize(options: { soundFont?: string; volume?: number }): Promise<void> {
    // Try multi-file setup first
    if (!this.setupTrackSamplers(options)) {
      // Fallback to legacy single sampler
      await this.setupLegacySampler(options);
    }

    // Wait for all samplers to be fully loaded
    if (this.trackSamplers.size > 0) {
      const loadPromises = Array.from(this.trackSamplers.values()).map(
        async (track) => {
          try {
            await track.sampler.loaded;
            // Loaded
          } catch (err) {
            console.warn("Sampler load warning:", err);
          }
        }
      );
      await Promise.allSettled(loadPromises);
    } else if (this.sampler) {
      await this.sampler.loaded;
    }
  }

  /**
   * Set up per-track samplers for multi-file playback
   * @returns true if multi-file setup succeeded, false for fallback
   */
  private setupTrackSamplers(options: { soundFont?: string; volume?: number }): boolean {
    // Group notes by fileId
    const fileNotes = new Map<string, NoteData[]>();
    this.notes.forEach((note) => {
      const fid = note.fileId || "__default";
      if (!fileNotes.has(fid)) {
        fileNotes.set(fid, []);
      }
      fileNotes.get(fid)!.push(note);
    });

    // Create sampler for each file ID
    fileNotes.forEach((_notes, fid) => {
      if (!this.trackSamplers.has(fid)) {
        const panner = new Tone.Panner(0).toDestination();
        const gate = new Tone.Gain(1).connect(panner);
        // Optional alignment delay node between sampler and gate
        const delay = this.alignmentDelaySec > 0 ? new Tone.Delay(this.alignmentDelaySec) : null;
        const sampler = new Tone.Sampler({
          urls: DEFAULT_SAMPLE_MAP,
          baseUrl:
            options.soundFont ||
            "https://tonejs.github.io/audio/salamander/",
          onload: () => {
            // Sampler loaded for file
          },
          onerror: (error: Error) => {
            console.error(`Failed to load sampler for file ${fid}:`, error);
          },
        }).connect(delay ? delay : gate);
        if (delay) delay.connect(gate);

        // Initialize volume
        const currentVolume = options.volume ?? AUDIO_CONSTANTS.DEFAULT_VOLUME;
        this.applySamplerVolume(sampler, currentVolume);

        // Get initial muted state from MIDI manager
        let initialMuted = false;
        if (this.midiManager) {
          const state = this.midiManager.getState();
          const file = state.files.find((f: any) => f.id === fid);
          if (file) {
            initialMuted = file.isMuted || false;
          }
        }

        this.trackSamplers.set(fid, { sampler, delay, gate, panner, muted: initialMuted });
      }
    });

    return this.trackSamplers.size > 0;
  }

  /**
   * Fallback: Set up legacy single sampler
   */
  private async setupLegacySampler(options: { soundFont?: string; volume?: number }): Promise<void> {
    this.panner = new Tone.Panner(0).toDestination();
    this.gate = new Tone.Gain(1).connect(this.panner);
    const delay = this.alignmentDelaySec > 0 ? new Tone.Delay(this.alignmentDelaySec) : null;
    this.sampler = new Tone.Sampler({
      urls: DEFAULT_SAMPLE_MAP,
      baseUrl:
        options.soundFont || "https://tonejs.github.io/audio/salamander/",
    }).connect(delay ? delay : this.gate);
    if (delay) delay.connect(this.gate);

    // Set initial volume
    const currentVolume = options.volume ?? AUDIO_CONSTANTS.DEFAULT_VOLUME;
    this.applySamplerVolume(this.sampler, currentVolume);

    // Wait for samples to load
    await this.sampler.loaded;
  }

  /**
   * Create note part for Tone.js scheduling
   */
  setupNotePart(
    loopStartVisual?: number | null,
    loopEndVisual?: number | null,
    options?: { repeat?: boolean; duration?: number; tempo?: number; originalTempo?: number }
  ): void {
    // Multi-file setup always takes precedence
    if (this.trackSamplers.size > 0) {
      this.setupMultiTrackPart(loopStartVisual, loopEndVisual, options);
      return;
    }

    // Legacy single-sampler fallback
    if (!this.sampler) return;
    this.setupLegacyPart(loopStartVisual, loopEndVisual, options);
  }

  private setupMultiTrackPart(
    loopStartVisual?: number | null,
    loopEndVisual?: number | null,
    options?: { repeat?: boolean; duration?: number; tempo?: number; originalTempo?: number }
  ): void {
    const scaleToTransport = this.computeScaleToTransport(
      options?.originalTempo,
      options?.tempo
    );
    const filtered = this.filterNotesByLoopWindow(
      this.notes,
      loopStartVisual,
      loopEndVisual
    );
    type ScheduledNoteEvent = {
      time: number;
      note: string;
      duration: number;
      velocity: number;
      fileId: string;
    };
    const events: ScheduledNoteEvent[] = this.notesToEventsWithFileId(
      filtered,
      loopStartVisual,
      scaleToTransport
    );

    // Track if we've warned about each unloaded sampler
    const warnedSamplers = new Set<string>();
    
    // Build events for Part

    const callback = (time: number, event: ScheduledNoteEvent) => {
      const fid = event.fileId || "__default";
      const track = this.trackSamplers.get(fid);
      if (track && !track.muted) {
        if (track.sampler.loaded) {
          // Schedule note with slight lookahead for smoother playback
          const scheduledTime = Math.max(time, Tone.now());
          track.sampler.triggerAttackRelease(
            event.note,
            event.duration,
            scheduledTime,
            event.velocity
          );
        } else if (!warnedSamplers.has(fid)) {
          console.warn(
            `Sampler not yet loaded for file ${fid}, notes will be skipped until loaded`
          );
          warnedSamplers.add(fid);
        }
      }
    };
    this.buildPart(
      events,
      {
        repeat: options?.repeat,
        duration: options?.duration,
        tempo: options?.tempo,
        originalTempo: options?.originalTempo,
      },
      callback
    );
  }

  private setupLegacyPart(
    loopStartVisual?: number | null,
    loopEndVisual?: number | null,
    options?: { repeat?: boolean; duration?: number; tempo?: number; originalTempo?: number }
  ): void {
    const scaleToTransport = this.computeScaleToTransport(
      options?.originalTempo,
      options?.tempo
    );
    const filtered = this.filterNotesByLoopWindow(
      this.notes,
      loopStartVisual,
      loopEndVisual
    );
    const events = this.notesToEvents(
      filtered,
      loopStartVisual,
      scaleToTransport
    );

    const callback = (
      time: number,
      event: { time: number; note: string; duration: number; velocity: number }
    ) => {
      if (this.sampler && this.sampler.loaded) {
        // Schedule note with slight lookahead for smoother playback
        const scheduledTime = Math.max(time, Tone.now());
        this.sampler.triggerAttackRelease(
          event.note,
          event.duration,
          scheduledTime,
          event.velocity
        );
      }
    };
    this.buildPart(
      events,
      {
        repeat: options?.repeat,
        duration: options?.duration,
        tempo: options?.tempo,
        originalTempo: options?.originalTempo,
      },
      callback
    );
  }

  /**
   * Start the part at specified offset
   */
  startPart(time: string | number, offset?: number): void {
    if (!this.part) {
      console.warn("[SamplerManager] No Part to start");
      return;
    }
    
    // Check Part state to prevent duplicate starts
    const partState = (this.part as any).state;
    if (partState === "started") {
      console.warn("[SamplerManager] Part already started, stopping first");
      this.part.stop(0);
      this.part.cancel(0);
    }
    
    // Ensure the part is completely stopped before starting
    this.part.stop(0);
    this.part.cancel(0);
    
    // Start part with a safe non-negative offset (avoid tiny negative epsilons)
    const off = typeof offset === 'number' && Number.isFinite(offset) ? Math.max(0, offset) : 0;
    
    try {
      (this.part as Tone.Part).start(time, off);
      // console.log("[SamplerManager] Part started", { time, offset: off });
    } catch (e) {
      console.error("[SamplerManager] Failed to start Part:", e);
    }
  }

  /**
   * Stop and cancel the part
   */
  stopPart(): void {
    if (this.part) {
      // Use immediate stop for faster response
      this.part.stop(0);
      this.part.cancel(0);
      // Don't dispose here - let buildPart handle disposal when creating a new one
    }
  }
  
  /**
   * Restart the part for seamless looping
   * This avoids recreating the Part which can cause gaps
   */
  restartPartAtLoop(): void {
    if (this.part) {
      // Cancel any scheduled events to prevent overlap
      this.part.cancel();
      
      // Immediately restart the part from the beginning
      // Use a very small offset to ensure smooth transition
      const restartTime = Tone.now() + 0.001;
      (this.part as Tone.Part).start(restartTime, 0);
    }
  }

  /**
   * Set volume for all samplers
   */
  setVolume(volume: number): void {
    // Legacy single sampler
    if (this.sampler) {
      this.applySamplerVolume(this.sampler, volume);
    }

    // Per-track samplers
    this.trackSamplers.forEach(({ sampler }) => {
      this.applySamplerVolume(sampler, volume);
    });
  }

  /**
   * Set pan for all samplers
   */
  setPan(pan: number): void {
    // Legacy single panner
    if (this.panner) {
      this.applyPannerPan(this.panner, pan);
    }

    // Apply to all track-level panners
    this.trackSamplers.forEach(({ panner }) => {
      this.applyPannerPan(panner, pan);
    });
  }

  /**
   * Set alignment delay in seconds for all sampler outputs (compensate external FX latency).
   */
  setAlignmentDelaySec(delaySec: number): void {
    const d = Math.max(0, delaySec || 0);
    this.alignmentDelaySec = d;
    // Update existing tracks
    this.trackSamplers.forEach((track) => {
      if (!track.delay && d > 0) {
        // Insert delay node dynamically
        try {
          const newDelay = new Tone.Delay(d);
          track.sampler.disconnect();
          track.sampler.connect(newDelay);
          newDelay.connect(track.panner);
          track.delay = newDelay;
        } catch {}
      } else if (track.delay && d === 0) {
        try {
          track.sampler.disconnect();
          track.delay.disconnect();
          track.delay.dispose();
          track.delay = null;
          track.sampler.connect(track.panner);
        } catch {}
      } else if (track.delay) {
        try { track.delay.delayTime.value = d; } catch {}
      }
    });
    // Legacy sampler path: cannot easily rewire if already connected; best-effort
    // (We keep legacy path minimal as multi-track is preferred.)
  }

  /**
   * Set pan for a specific file
   */
  setFilePan(fileId: string, pan: number): void {
    if (!this.trackSamplers.has(fileId)) {
      console.warn(`File ID "${fileId}" not found in trackSamplers.`);
      return;
    }
    const { panner } = this.trackSamplers.get(fileId)!;
    this.applyPannerPan(panner, pan);
  }

  /**
   * Set mute state for a specific file
   */
  setFileMute(fileId: string, mute: boolean): void {
    if (this.trackSamplers.has(fileId)) {
      const track = this.trackSamplers.get(fileId)!;
      track.muted = mute;
    }
  }

  /**
   * Ensure the specified track is audible. If its sampler volume is effectively
   * silent (<= SILENT_DB), lift it to the provided masterVolume.
   */
  ensureTrackAudible(fileId: string, masterVolume: number): void {
    const track = this.getTrack(fileId);
    if (!track) return;
    const before = track.sampler.volume.value;
    if (isSilentDb(before, AUDIO_CONSTANTS.SILENT_DB)) {
      try {
        const nextDb = toDb(clamp01(masterVolume));
        track.sampler.volume.value = nextDb;
        // lifted from silence
      } catch {}
    } else {
      // already audible
    }
  }

  /**
   * Retrigger any notes that are currently sustaining at `currentTime` for the given file.
   * Useful when a track is unmuted while the transport is already running so that
   * long-held notes become audible immediately without waiting for the next onset.
   */
  retriggerHeldNotes(fileId: string, currentTime: number): void {
    const track = this.trackSamplers.get(fileId);
    if (!track) return;

    // Iterate notes belonging to this file
    const now = Tone.now();
    const EPS = 1e-3;
    const fid = fileId || "__default";
    let retriggered = 0;
    this.notes.forEach((note) => {
      const nFid = note.fileId || "__default";
      if (nFid !== fid) return;

      const onset = note.time as number;
      const end = onset + (note.duration as number);
      if (onset <= currentTime + EPS && end > currentTime + EPS) {
        const remaining = end - currentTime;
        if (remaining > 0 && !track.muted) {
          try {
            if (track.sampler && track.sampler.loaded) {
              track.sampler.triggerAttackRelease(
                note.name,
                remaining,
                now,
                note.velocity
              );
              retriggered++;
            }
          } catch {
            // Best-effort; ignore transient errors
          }
        }
      }
    });
    // retrigger summary suppressed (debug)
  }

  /**
   * Retrigger held notes for all unmuted tracks at the current time
   * Useful after seeking to ensure long notes are audible at the new position
   */
  retriggerAllUnmutedHeldNotes(currentTime: number): void {
    let totalRetriggered = 0;
    
    // Retrigger for all unmuted tracks
    this.trackSamplers.forEach((track, fileId) => {
      if (!track.muted) {
        const beforeCount = totalRetriggered;
        this.retriggerHeldNotes(fileId, currentTime);
        // Note: retriggerHeldNotes doesn't return count, so we can't track exact numbers
      }
    });
    
    // console.log("[SamplerManager] Retriggered held notes for all unmuted tracks at", currentTime);
  }

  /**
   * Set volume for a specific file
   */
  setFileVolume(fileId: string, volume: number, masterVolume: number): void {
    const track = this.getTrack(fileId);
    if (!track) {
      return;
    }

    // Apply volume to the sampler
    const clampedVolume = clamp01(volume);
    const db = toDb(mixLinear(masterVolume, clampedVolume));
    track.sampler.volume.value = db;

    // Update muted flag based on volume
    track.muted = clampedVolume === 0;
  }

  /**
   * Get file mute states
   */
  getFileMuteStates(): Map<string, boolean> {
    const states = new Map<string, boolean>();
    this.trackSamplers.forEach((track, fileId) => {
      states.set(fileId, track.muted);
    });
    return states;
  }

  /**
   * Get file volume states
   */
  getFileVolumeStates(): Map<string, number> {
    const states = new Map<string, number>();
    this.trackSamplers.forEach((track, fileId) => {
      // Convert dB back to linear
      const linearVolume = fromDb(track.sampler.volume.value);
      states.set(fileId, linearVolume);
    });
    return states;
  }

  /**
   * Check if all tracks have zero volume
   */
  areAllTracksZeroVolume(): boolean {
    const SILENT_DB = -60;
    if (this.trackSamplers.size === 0) {
      return this.sampler ? this.sampler.volume.value <= SILENT_DB : true;
    }
    return !Array.from(this.trackSamplers.values()).some(
      track => !track.muted && track.sampler.volume.value > SILENT_DB
    );
  }

  /**
   * Check if all tracks are muted
   */
  areAllTracksMuted(): boolean {
    const SILENT_DB = AUDIO_CONSTANTS.SILENT_DB;
    
    // Check multi-track samplers
    if (this.trackSamplers.size > 0) {
      return !Array.from(this.trackSamplers.values()).some(
        (t) => !t.muted && t.sampler.volume.value > SILENT_DB
      );
    }
    
    // Check legacy sampler
    if (this.sampler) {
      return this.sampler.volume.value <= SILENT_DB;
    }
    
    return true;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.part) {
      this.part.dispose();
      this.part = null;
    }

    if (this.sampler) {
      this.sampler.dispose();
      this.sampler = null;
    }

    if (this.panner) {
      this.panner.dispose();
      this.panner = null;
    }
    if (this.gate) {
      try { this.gate.dispose(); } catch {}
      this.gate = null;
    }

    // Dispose per-track samplers / panners
    this.trackSamplers.forEach(({ sampler, panner }) => {
      sampler.dispose();
      panner.dispose();
    });
    this.trackSamplers.clear();
  }

  /**
   * Immediately stop/kill any currently sounding voices to prevent tail/bleed.
   * Best-effort: tries Sampler/PolySynth-specific release helpers if available.
   */
  stopAllVoicesImmediate(): void {
    const now = (Tone as any).now?.() ?? 0;

    // Multi-track samplers
    this.trackSamplers.forEach(({ sampler }) => {
      try {
        // Try PolySynth-like API if available
        const anyS = sampler as unknown as { releaseAll?: (time?: number) => void; triggerRelease?: (notes?: any, time?: number) => void };
        if (typeof anyS.releaseAll === "function") {
          anyS.releaseAll(now);
          return;
        }
        if (typeof anyS.triggerRelease === "function") {
          // Trigger release for any held voices
          anyS.triggerRelease(undefined as any, now);
          return;
        }
      } catch {}
    });

    // Legacy single sampler
    if (this.sampler) {
      try {
        const anyS = this.sampler as unknown as { releaseAll?: (time?: number) => void; triggerRelease?: (notes?: any, time?: number) => void };
        if (typeof anyS.releaseAll === "function") {
          anyS.releaseAll(now);
        } else if (typeof anyS.triggerRelease === "function") {
          anyS.triggerRelease(undefined as any, now);
        }
      } catch {}
    }
  }

  /**
   * Get the current part instance
   */
  getPart(): Tone.Part | null {
    return this.part;
  }

  /**
   * Hard mute all track gates to instantly silence any residual sound.
   */
  hardMuteAllGates(): void {
    try {
      this.trackSamplers.forEach(({ gate }) => { try { gate.gain.value = 0; } catch {} });
      if (this.gate) { try { this.gate.gain.value = 0; } catch {} }
    } catch {}
  }

  /**
   * Unmute all track gates.
   */
  hardUnmuteAllGates(): void {
    try {
      this.trackSamplers.forEach(({ gate }) => { try { gate.gain.value = 1; } catch {} });
      if (this.gate) { try { this.gate.gain.value = 1; } catch {} }
    } catch {}
  }

  /**
   * Check if samplers are initialized
   */
  isInitialized(): boolean {
    return this.trackSamplers.size > 0 || this.sampler !== null;
  }
}
