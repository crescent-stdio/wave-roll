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
    options: { repeat?: boolean; duration?: number } | undefined,
    callback: (time: number, event: T) => void
  ): void {
    this.part = new Tone.Part(callback as any, events as any);
    this.part.loop = options?.repeat || false;
    this.part.loopStart = 0;
    this.part.loopEnd = options?.duration || 0;
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
        }).connect(panner);

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
    this.buildPart(events, { repeat: options?.repeat, duration: options?.duration }, callback);
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
    this.buildPart(events, { repeat: options?.repeat, duration: options?.duration }, callback);
  }

  /**
   * Start the part at specified offset
   */
  startPart(time: string | number, offset?: number): void {
    if (this.part) {
      this.part.stop("+0");
      this.part.cancel();
      // Start part with a safe non-negative offset (avoid tiny negative epsilons)
      const off = typeof offset === 'number' && Number.isFinite(offset) ? Math.max(0, offset) : 0;
      (this.part as Tone.Part).start(time, off);
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
