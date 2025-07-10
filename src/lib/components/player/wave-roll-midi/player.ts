/**
 * WaveRollPlayer – an integrated Audio + Piano-roll component.
 *
 * * Responsibilities*
 *   1. Build AudioPlayer + PianoRoll core objects.
 *   2. Compose UI controls (playback, loop, volume, tempo, …).
 *   3. Maintain a lightweight update-loop to keep UI ⇄ audio ⇄ piano-roll in sync.
 *
 * The class itself **owns no UI-implementation details**: every visual control
 * is imported from `lib/components/ui/**`. That keeps the orchestration layer
 * small and easy to test.
 */

import { NoteData } from "@/lib/midi/types";
import {
  createAudioPlayer,
  PlayerOptions,
} from "@/lib/core/audio/audio-player";
import { createPianoRoll } from "@/lib/core/visualization/piano-roll";

import type {
  PianoRollOptions,
  PianoRollInstance,
} from "@/lib/core/visualization/piano-roll/types";

import type { AudioPlayerContainer } from "@/lib/core/audio/audio-player";
import { formatTime } from "@/lib/core/utils/time";
import type { WaveRollMidiPlayerOptions } from "./types";

/* UI controls ------------------------------------------------------- */
import { createPlaybackControls } from "@/lib/core/controls/playback-controls";
import { createLoopControls } from "@/lib/core/controls/loop-controls";
import { createVolumeControl } from "@/lib/core/controls/volume-control";
import { createTempoControl } from "@/lib/core/controls/tempo-control";
import { createZoomControls } from "@/lib/core/controls/zoom-controls";
import { createSettingsControl } from "@/lib/core/controls/settings-control";

/* Seek-bar (time display + drag behaviour) -------------------------- */
import { createSeekBar, SeekBarInstance } from "./ui/seek-bar";

/* ------------------------------------------------------------------ */
/* Public API types                                                   */
/* ------------------------------------------------------------------ */

export class WaveRollMidiPlayer {
  /* ----------------------------------------------------------------
   * Construction
   * ---------------------------------------------------------------- */
  private readonly container: HTMLElement;
  private readonly notes: NoteData[];
  private readonly options: WaveRollMidiPlayerOptions;

  /* Core objects */
  private pianoRoll!: PianoRollInstance;
  private audioPlayer!: AudioPlayerContainer;

  /* UI */
  private controlsRoot: HTMLElement;
  private seekBar!: SeekBarInstance;

  /* Update loop */
  private loopId = 0;

  /* ----------------------------------------------------------------
   * Lifecycle
   * ---------------------------------------------------------------- */
  constructor(
    container: HTMLElement,
    notes: NoteData[],
    options: WaveRollMidiPlayerOptions = {}
  ) {
    this.container = container;
    this.notes = notes;
    this.options = {
      showVolumeControl: true,
      showTempoControl: true,
      showZoomControl: true,
      showSettingsControl: true,
      ...options,
    };

    this.controlsRoot = document.createElement("div");
  }

  /** Build everything and mount into the given container. */
  public async initialize(): Promise<void> {
    /* Piano-roll ---------------------------------------------------- */
    const pianoWrap = document.createElement("div");
    pianoWrap.style.cssText = `
      width: 100%;
      height: 400px;
      border:1px solid #ddd; border-radius:8px; margin-bottom:20px; background:#fff;
    `;

    this.pianoRoll = await createPianoRoll(
      pianoWrap,
      this.notes,
      this.options.pianoRoll
    );

    /* AudioPlayer -------------------------------------------------- */
    this.audioPlayer = createAudioPlayer(
      this.notes,
      this.pianoRoll,
      this.options.player
    );

    /* Mutual time sync when user drags the piano-roll. */
    this.pianoRoll?.onTimeChange?.((t: number) =>
      this.audioPlayer.seek(t, false)
    );

    /* UI ----------------------------------------------------------- */
    this.setupUI();

    /* Mount DOM ---------------------------------------------------- */
    this.container.replaceChildren(pianoWrap, this.controlsRoot);

    /* Start update loop ------------------------------------------- */
    this.startUpdateLoop();
  }

  /** Tear everything down. */
  public destroy(): void {
    cancelAnimationFrame(this.loopId);
    this.audioPlayer?.destroy();
    this.pianoRoll?.destroy();
  }

  /* ----------------------------------------------------------------
   * Private helpers
   * ---------------------------------------------------------------- */

  /** Compose all UI widgets. */
  private setupUI(): void {
    this.controlsRoot.innerHTML = "";
    this.controlsRoot.style.cssText = `
      display:flex; flex-direction:column; gap:8px;
      background:#f8f9fa; padding:12px; border-radius:8px;
      box-shadow:0 1px 3px rgba(0,0,0,0.08);
    `;

    /* Top row – buttons & sliders ------------------------------ */
    const row = document.createElement("div");
    row.style.cssText = `
      display:flex; align-items:center; gap:20px; flex-wrap:wrap;
    `;

    /* Playback */
    const { element: playbackUI } = createPlaybackControls(this.audioPlayer);
    row.appendChild(playbackUI);

    /* Loop (A-B) */
    const { element: loopUI } = createLoopControls({
      audioPlayer: this.audioPlayer,
      pianoRoll: this.pianoRoll,
      formatTime,
    });
    row.appendChild(loopUI);

    /* Volume */
    if (this.options.showVolumeControl) {
      const volumeControl = createVolumeControl({
        audioPlayer: this.audioPlayer,
      });
      row.appendChild(volumeControl);
    }

    /* Tempo */
    if (this.options.showTempoControl) {
      const tempoControl = createTempoControl({
        audioPlayer: this.audioPlayer,
      });
      row.appendChild(tempoControl);
    }

    /* Zoom reset */
    if (this.options.showZoomControl) {
      const zoomControl = createZoomControls({ pianoRoll: this.pianoRoll });
      row.appendChild(zoomControl);
    }

    /* Settings modal trigger */
    if (this.options.showSettingsControl) {
      row.appendChild(createSettingsControl(this.pianoRoll));
    }

    this.controlsRoot.appendChild(row);

    /* Seek bar -------------------------------------------------- */
    this.seekBar = createSeekBar({
      audioPlayer: this.audioPlayer,
      pianoRoll: this.pianoRoll,
      formatTime,
    });
    this.controlsRoot.appendChild(this.seekBar.element);
  }

  /** 60 fps update-loop – keeps seek-bar in sync. */
  private startUpdateLoop(): void {
    const step = () => {
      const { currentTime, duration } = this.audioPlayer.getState();
      // The seek-bar itself internally handles loop overlays via the
      // LoopControls component, so we pass `null` here.
      this.seekBar.update(currentTime, duration, null);
      this.loopId = requestAnimationFrame(step);
    };
    this.loopId = requestAnimationFrame(step);
  }

  /* ----------------------------------------------------------------
   * Debug helpers
   * ---------------------------------------------------------------- */
  public getState() {
    return {
      audio: this.audioPlayer?.getState(),
      piano: this.pianoRoll?.getState?.(),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Factory – convenient sugar so demo pages can one-liner instanciate. */
/* ------------------------------------------------------------------ */
export async function createWaveRollMidiPlayer(
  container: HTMLElement,
  notes: NoteData[],
  options?: WaveRollMidiPlayerOptions
): Promise<WaveRollMidiPlayer> {
  const player = new WaveRollMidiPlayer(container, notes, options);
  await player.initialize();
  return player;
}
