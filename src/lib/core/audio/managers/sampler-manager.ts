/**
 * Sampler Manager for MIDI playback
 * Handles Tone.js sampler creation, loading, and playback
 */

import * as Tone from "tone";
import { NoteData } from "@/lib/midi/types";
import { DEFAULT_SAMPLE_MAP, AUDIO_CONSTANTS, AudioPlayerState } from "../player-types";

export interface SamplerTrack {
  sampler: Tone.Sampler;
  panner: Tone.Panner;
  muted: boolean;
}

export class SamplerManager {
  /** Legacy single sampler (used for single-file players) */
  private sampler: Tone.Sampler | null = null;
  /** Global panner for legacy single-sampler path */
  private panner: Tone.Panner | null = null;
  /** Map of fileId -> {sampler, panner, muted} for multi-file playback */
  private trackSamplers: Map<string, SamplerTrack> = new Map();
  /** Current Tone.Part for scheduling note events */
  private part: Tone.Part | null = null;
  /** Notes to be played */
  private notes: NoteData[];
  /** MIDI manager reference */
  private midiManager: any;
  
  constructor(notes: NoteData[], midiManager?: any) {
    this.notes = notes;
    this.midiManager = midiManager;
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
            console.log("Sampler fully loaded and ready");
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
        const sampler = new Tone.Sampler({
          urls: DEFAULT_SAMPLE_MAP,
          baseUrl:
            options.soundFont ||
            "https://tonejs.github.io/audio/salamander/",
          onload: () => {
            console.log(`Sampler loaded for file ${fid}`);
          },
          onerror: (error: Error) => {
            console.error(`Failed to load sampler for file ${fid}:`, error);
          },
        }).connect(panner);

        // Initialize volume
        const currentVolume = options.volume ?? AUDIO_CONSTANTS.DEFAULT_VOLUME;
        sampler.volume.value = Tone.gainToDb(currentVolume);

        // Get initial muted state from MIDI manager
        let initialMuted = false;
        if (this.midiManager) {
          const state = this.midiManager.getState();
          const file = state.files.find((f: any) => f.id === fid);
          if (file) {
            initialMuted = file.isMuted || false;
          }
        }

        this.trackSamplers.set(fid, { sampler, panner, muted: initialMuted });
      }
    });

    return this.trackSamplers.size > 0;
  }

  /**
   * Fallback: Set up legacy single sampler
   */
  private async setupLegacySampler(options: { soundFont?: string; volume?: number }): Promise<void> {
    this.panner = new Tone.Panner(0).toDestination();
    this.sampler = new Tone.Sampler({
      urls: DEFAULT_SAMPLE_MAP,
      baseUrl:
        options.soundFont || "https://tonejs.github.io/audio/salamander/",
    }).connect(this.panner);

    // Set initial volume
    const currentVolume = options.volume ?? AUDIO_CONSTANTS.DEFAULT_VOLUME;
    this.sampler.volume.value = Tone.gainToDb(currentVolume);

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
    // CRITICAL: Convert visual seconds to transport seconds
    // Transport runs at originalTempo/tempo speed relative to visual time
    const scaleToTransport = (options?.originalTempo && options?.tempo)
      ? options.originalTempo / options.tempo
      : 1;
    // Create events, optionally windowed for A-B looping
    const events: Array<{
      time: number;
      note: string;
      duration: number;
      velocity: number;
      fileId: string;
    }> = this.notes
      .filter((note) => {
        // When a custom loop window is active, keep any note that INTERSECTS
        // [loopStartVisual, loopEndVisual).  This includes notes whose onset
        // is earlier than the loop window but whose tail sustains into it.
        if (
          loopStartVisual !== undefined &&
          loopEndVisual !== undefined &&
          loopStartVisual !== null &&
          loopEndVisual !== null
        ) {
          const noteEnd = note.time + note.duration;
          return (
            noteEnd > loopStartVisual && note.time < loopEndVisual
          );
        }
        // No window - include all notes
        return true;
      })
      .map((note) => {
        const onset = note.time; // This is in visual seconds
        const duration = note.duration;
        
        // Convert to transport seconds
        const transportOnset = onset * scaleToTransport;
        const transportDuration = duration * scaleToTransport;
        
        // Shift timeline when a custom loop window is active.
        const relativeTime =
          loopStartVisual !== undefined && loopStartVisual !== null
            ? transportOnset - (loopStartVisual * scaleToTransport)
            : transportOnset;

        // Ensure safe, non-negative values to avoid Tone.js errors.
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

    // Track if we've warned about each unloaded sampler
    const warnedSamplers = new Set<string>();
    
    // Debug: log events
    console.log("[SM.setupPart] events", {
      count: events.length,
      first5: events.slice(0, 5).map(e => ({ time: e.time.toFixed(3), note: e.note })),
      tempoRatio: (options?.originalTempo && options?.tempo) 
        ? (options.originalTempo / options.tempo).toFixed(3)
        : 1,
      options
    });

    let eventCount = 0;
    this.part = new Tone.Part(
      (time: number, event) => {
        eventCount++;
      if (eventCount <= 3) {
        console.log("[SM.Part.callback]", { 
          eventCount, 
          time: time.toFixed(3), 
          eventTime: event.time,
          note: event.note,
          fileId: event.fileId 
        });
      }
      const fid = event.fileId || "__default";
      const track = this.trackSamplers.get(fid);
      if (track && !track.muted) {
        // Check if sampler is loaded before triggering notes
        if (track.sampler.loaded) {
          track.sampler.triggerAttackRelease(
            event.note,
            event.duration,
            time,
            event.velocity
          );
        } else if (!warnedSamplers.has(fid)) {
          // Only warn once per file to reduce console spam
          console.warn(
            `Sampler not yet loaded for file ${fid}, notes will be skipped until loaded`
          );
          warnedSamplers.add(fid);
        }
      }
    },
      events
    );

    // Set part to loop if transport is looping
    this.part.loop = options?.repeat || false;
    this.part.loopStart = 0;
    this.part.loopEnd = options?.duration || 0;
  }

  private setupLegacyPart(
    loopStartVisual?: number | null,
    loopEndVisual?: number | null,
    options?: { repeat?: boolean; duration?: number; tempo?: number; originalTempo?: number }
  ): void {
    // CRITICAL: Convert visual seconds to transport seconds
    const scaleToTransport = (options?.originalTempo && options?.tempo)
      ? options.originalTempo / options.tempo
      : 1;
    // Create events, optionally windowed for A-B looping
    const events: Array<{
      time: number;
      note: string;
      duration: number;
      velocity: number;
    }> = this.notes
      .filter((note) => {
        if (
          loopStartVisual !== undefined &&
          loopEndVisual !== undefined &&
          loopStartVisual !== null &&
          loopEndVisual !== null
        ) {
          const noteEnd = note.time + note.duration;
          return (
            noteEnd > loopStartVisual && note.time < loopEndVisual
          );
        }
        return true;
      })
      .map((note) => {
        const onset = note.time; // This is in visual seconds
        const duration = note.duration;
        
        // Convert to transport seconds
        const transportOnset = onset * scaleToTransport;
        const transportDuration = duration * scaleToTransport;
        
        const relativeTime =
          loopStartVisual !== undefined && loopStartVisual !== null
            ? transportOnset - (loopStartVisual * scaleToTransport)
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

    this.part = new Tone.Part((time: number, event) => {
      // Check if sampler exists and is loaded
      if (this.sampler && this.sampler.loaded) {
        this.sampler.triggerAttackRelease(
          event.note,
          event.duration,
          time,
          event.velocity
        );
      }
    }, events);

    // Set part loop settings to match transport
    this.part.loop = options?.repeat || false;
    this.part.loopStart = 0;
    this.part.loopEnd = options?.duration || 0;
  }

  /**
   * Start the part at specified offset
   */
  startPart(time: string | number, offset?: number): void {
    if (this.part) {
      this.part.stop();
      this.part.cancel();
      console.log("[SM.startPart]", { time, offset });
      (this.part as Tone.Part).start(time, offset);
    }
  }

  /**
   * Stop and cancel the part
   */
  stopPart(): void {
    if (this.part) {
      this.part.stop("+0");
      this.part.cancel();
    }
  }

  /**
   * Set volume for all samplers
   */
  setVolume(volume: number): void {
    const db = Tone.gainToDb(volume);

    // Legacy single sampler
    if (this.sampler) {
      this.sampler.volume.value = db;
    }

    // Per-track samplers
    this.trackSamplers.forEach(({ sampler }) => {
      sampler.volume.value = db;
    });
  }

  /**
   * Set pan for all samplers
   */
  setPan(pan: number): void {
    const clamped = Math.max(-1, Math.min(1, pan));

    // Legacy single panner
    if (this.panner) {
      this.panner.pan.value = clamped;
    }

    // Apply to all track-level panners
    this.trackSamplers.forEach(({ panner }) => {
      panner.pan.value = clamped;
    });
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
    const clamped = Math.max(-1, Math.min(1, pan));
    panner.pan.value = clamped;
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
    const track = this.trackSamplers.get(fileId);
    if (!track) return;
    const SILENT_DB = AUDIO_CONSTANTS.SILENT_DB;
    const before = track.sampler.volume.value;
    if (before <= SILENT_DB) {
      try {
        const nextDb = Tone.gainToDb(
          Math.max(0, Math.min(1, masterVolume))
        );
        track.sampler.volume.value = nextDb;
        console.log("[SM.ensureTrackAudible] lifted", {
          fileId,
          before,
          nextDb,
          masterVolume,
        });
      } catch {}
    } else {
      console.log("[SM.ensureTrackAudible] already audible", {
        fileId,
        db: before,
      });
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
    console.log("[SM.retriggerHeldNotes]", { fileId, currentTime, retriggered });
  }

  /**
   * Set volume for a specific file
   */
  setFileVolume(fileId: string, volume: number, masterVolume: number): void {
    const track = this.trackSamplers.get(fileId);
    if (!track) {
      return;
    }

    // Apply volume to the sampler
    const clampedVolume = Math.max(0, Math.min(1, volume));
    const db = Tone.gainToDb(clampedVolume * masterVolume);
    track.sampler.volume.value = db;

    // Update muted flag based on volume
    track.muted = clampedVolume === 0;
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

    // Dispose per-track samplers / panners
    this.trackSamplers.forEach(({ sampler, panner }) => {
      sampler.dispose();
      panner.dispose();
    });
    this.trackSamplers.clear();
  }

  /**
   * Get the current part instance
   */
  getPart(): Tone.Part | null {
    return this.part;
  }

  /**
   * Check if samplers are initialized
   */
  isInitialized(): boolean {
    return this.trackSamplers.size > 0 || this.sampler !== null;
  }
}
