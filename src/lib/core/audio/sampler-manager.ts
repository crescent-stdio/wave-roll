/**
 * Sampler Manager
 * Handles creation and management of Tone.js Samplers for MIDI playback
 */

import * as Tone from "tone";
import { NoteData } from "@/lib/midi/types";

export interface TrackSampler {
  sampler: Tone.Sampler;
  panner: Tone.Panner;
  muted: boolean;
}

export class SamplerManager {
  private trackSamplers = new Map<string, TrackSampler>();
  private sampler: Tone.Sampler | null = null;
  private panner: Tone.Panner | null = null;
  private part: Tone.Part | null = null;

  constructor(
    private notes: NoteData[],
    private options: any,
    private state: any,
    private midiManager: any,
    private _loopStartVisual: number | null,
    private _loopEndVisual: number | null
  ) {}

  getTrackSamplers() {
    return this.trackSamplers;
  }

  getSampler() {
    return this.sampler;
  }

  getPanner() {
    return this.panner;
  }

  getPart() {
    return this.part;
  }

  setPart(part: Tone.Part | null) {
    this.part = part;
  }

  async setupLegacySampler(): Promise<void> {
    this.panner = new Tone.Panner(0).toDestination();
    this.sampler = new Tone.Sampler({
      urls: this.getDefaultSampleMap(),
      baseUrl: this.options.soundFont || undefined,
    }).connect(this.panner);

    const currentVolume = this.state?.volume ?? this.options.volume;
    this.sampler.volume.value = Tone.gainToDb(currentVolume);
    
    await this.sampler.loaded;
  }

  setupTrackSamplers(): boolean {
    const fileNotes = new Map<string, NoteData[]>();
    this.notes.forEach((note) => {
      const fid = note.fileId || "__default";
      if (!fileNotes.has(fid)) {
        fileNotes.set(fid, []);
      }
      fileNotes.get(fid)!.push(note);
    });

    fileNotes.forEach((_notes, fid) => {
      if (!this.trackSamplers.has(fid)) {
        const panner = new Tone.Panner(0).toDestination();
        const sampler = new Tone.Sampler({
          urls: this.getDefaultSampleMap(),
          baseUrl: this.options.soundFont || undefined,
          onload: () => {
            console.log(`Sampler loaded for file ${fid}`);
          },
          onerror: (error: Error) => {
            console.error(`Failed to load sampler for file ${fid}:`, error);
          }
        }).connect(panner);

        const currentVolume = this.state?.volume ?? this.options.volume;
        sampler.volume.value = Tone.gainToDb(currentVolume);

        const cachedPan = this.state?.pan ?? 0;
        panner.pan.value = cachedPan;

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

    this.createNotePart();
    return this.trackSamplers.size > 0;
  }

  private createNotePart(): void {
    const events: Array<{ time: number; note: string; duration: number; velocity: number; fileId: string }> = this.notes
      .filter((note) => {
        if (
          this._loopStartVisual !== undefined &&
          this._loopEndVisual !== undefined &&
          this._loopStartVisual !== null &&
          this._loopEndVisual !== null
        ) {
          const noteEnd = note.time + note.duration;
          return noteEnd > this._loopStartVisual && note.time < this._loopEndVisual;
        }
        return true;
      })
      .map((note) => {
        const onset = note.time;
        const duration = note.duration;
        const relativeTime =
          this._loopStartVisual !== undefined && this._loopStartVisual !== null
            ? onset - this._loopStartVisual
            : onset;

        const timeSafe = Math.max(0, relativeTime);
        const durationSafe = Math.max(0, duration);

        return {
          time: timeSafe,
          note: note.name,
          duration: durationSafe,
          velocity: note.velocity,
          fileId: note.fileId || "__default",
        };
      });

    const warnedSamplers = new Set<string>();
    type ScheduledEvent = { time: number; note: string; duration: number; velocity: number; fileId?: string };
    this.part = new Tone.Part((time: number, event: ScheduledEvent) => {
      const fid = event.fileId || "__default";
      const track = this.trackSamplers.get(fid);
      if (track && !track.muted) {
        if (track.sampler.loaded) {
          track.sampler.triggerAttackRelease(
            event.note,
            event.duration,
            time,
            event.velocity
          );
        } else if (!warnedSamplers.has(fid)) {
          console.warn(`Sampler not yet loaded for file ${fid}, notes will be skipped until loaded`);
          warnedSamplers.add(fid);
        }
      }
    }, events);
    
    this.part.loop = this.options.repeat;
    this.part.loopStart = 0;
    this.part.loopEnd = this.state.duration;
  }

  setupNotePart(loopStartVisual?: number, loopEndVisual?: number): void {
    if (this.trackSamplers.size > 0) {
      this.setupTrackSamplers();
      return;
    }

    if (!this.sampler) return;

    const events = this.notes
      .filter((note) => {
        if (
          this._loopStartVisual !== undefined &&
          this._loopEndVisual !== undefined &&
          this._loopStartVisual !== null &&
          this._loopEndVisual !== null
        ) {
          const noteEnd = note.time + note.duration;
          return noteEnd > this._loopStartVisual && note.time < this._loopEndVisual;
        }
        return true;
      })
      .map((note) => {
        const onset = note.time;
        const duration = note.duration;
        const relativeTime =
          this._loopStartVisual !== undefined && this._loopStartVisual !== null
            ? onset - this._loopStartVisual
            : onset;

        const timeSafe = Math.max(0, relativeTime);
        const durationSafe = Math.max(0, duration);

        return {
          time: timeSafe,
          note: note.name,
          duration: durationSafe,
          velocity: note.velocity,
        };
      });

    this.part = new Tone.Part((time: number, event: any) => {
      if (this.sampler && this.sampler.loaded) {
        this.sampler.triggerAttackRelease(
          event.note,
          event.duration,
          time,
          event.velocity
        );
      }
    }, events);
    
    this.part.loop = this.options.repeat;
    this.part.loopStart = 0;
    this.part.loopEnd = this.state.duration;
  }

  private getDefaultSampleMap(): { [note: string]: string } {
    return {
      C3: "C3.mp3",
      "D#3": "Ds3.mp3",
      "F#3": "Fs3.mp3",
      A3: "A3.mp3",
      C4: "C4.mp3",
      "D#4": "Ds4.mp3",
      "F#4": "Fs4.mp3",
      A4: "A4.mp3",
    };
  }

  dispose(): void {
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

    this.trackSamplers.forEach(({ sampler, panner }) => {
      sampler.dispose();
      panner.dispose();
    });
    this.trackSamplers.clear();
  }
}
