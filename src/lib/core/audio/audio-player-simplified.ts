/**
 * Simplified Audio Player for debugging initial load issues
 * Minimal implementation focused on getting sound working on first load
 */

import * as Tone from "tone";
import { NoteData } from "@/lib/midi/types";

export interface PianoRollSync {
  setTime(time: number): void;
}

export interface PlayerOptions {
  tempo?: number;
  volume?: number;
  repeat?: boolean;
  soundFont?: string;
  syncInterval?: number;
}

export class SimplifiedAudioPlayer {
  private sampler: Tone.Sampler | null = null;
  private part: Tone.Part | null = null;
  private isInitialized = false;
  private isPlaying = false;
  private syncTimer: number | null = null;

  constructor(
    private notes: NoteData[],
    private pianoRoll: PianoRollSync,
    private options: PlayerOptions = {}
  ) {
    this.options = {
      tempo: 120,
      volume: 0.7,
      repeat: false,
      soundFont: "",
      syncInterval: 16,
      ...options,
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log("Initializing simplified audio player...");

    // Ensure audio context is started
    if (Tone.context.state === "suspended") {
      console.log("Starting audio context...");
      await Tone.start();
    }

    // Create sampler with minimal config
    this.sampler = new Tone.Sampler({
      urls: {
        C4: "C4.mp3",
        "F#4": "Fs4.mp3",
        A4: "A4.mp3",
      },
      baseUrl: "https://tonejs.github.io/audio/salamander/",
    }).toDestination();

    // Set volume
    this.sampler.volume.value = Tone.gainToDb(this.options.volume || 0.7);

    // Wait for sampler to load
    console.log("Loading sampler...");
    await this.sampler.loaded;
    console.log("Sampler loaded!");

    // Create part with notes
    const events = this.notes.map((note) => ({
      time: note.time,
      note: note.name,
      duration: note.duration,
      velocity: note.velocity,
    }));

    this.part = new Tone.Part((time: number, event: any) => {
      if (this.sampler) {
        this.sampler.triggerAttackRelease(
          event.note,
          event.duration,
          time,
          event.velocity
        );
      }
    }, events);

    // Setup transport
    Tone.getTransport().bpm.value = this.options.tempo || 120;
    Tone.getTransport().loop = this.options.repeat || false;

    this.isInitialized = true;
    console.log("Initialization complete!");
  }

  async play(): Promise<void> {
    console.log("Play called, isInitialized:", this.isInitialized);

    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isPlaying) return;

    console.log("Starting playback...");

    // Start the part
    if (this.part) {
      this.part.start(0);
    }

    // Start transport
    Tone.getTransport().start();

    this.isPlaying = true;

    // Start sync timer
    this.startSync();

    console.log("Playback started!");
  }

  pause(): void {
    if (!this.isPlaying) return;

    Tone.getTransport().pause();
    this.isPlaying = false;
    this.stopSync();
  }

  private startSync(): void {
    const update = () => {
      if (!this.isPlaying) return;

      const time = Tone.getTransport().seconds;
      this.pianoRoll.setTime(time);

      this.syncTimer = window.setTimeout(update, this.options.syncInterval || 16);
    };
    update();
  }

  private stopSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
  }

  destroy(): void {
    this.stopSync();
    
    if (this.part) {
      this.part.dispose();
    }
    
    if (this.sampler) {
      this.sampler.dispose();
    }

    Tone.getTransport().stop();
    Tone.getTransport().cancel();
  }
}

// For testing - expose a simple play function
export async function testPlay(notes: NoteData[], pianoRoll: PianoRollSync): Promise<void> {
  const player = new SimplifiedAudioPlayer(notes, pianoRoll);
  await player.play();
  return;
}