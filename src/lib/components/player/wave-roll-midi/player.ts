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
import { createPlaybackControls } from "@/lib/components/ui/controls/playback";
import { createLoopControls } from "@/lib/components/ui/controls/loop";
import { createVolumeControl } from "@/lib/components/ui/controls/volume";
import { createTempoControl } from "@/lib/components/ui/controls/tempo";
import { createZoomControls } from "@/lib/components/ui/controls/zoom";
import { createSettingsControl } from "@/lib/components/ui/controls/settings";

import type { UIComponentDependencies } from "@/lib/components/ui/types";

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

  /** Debounce flag for rapid space-bar toggling */
  private isTogglingPlayback = false;

  /** Keep reference to the global <Space> key handler so we can unregister it */
  private spaceKeyHandler: ((e: KeyboardEvent) => void) | null = null;

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

    /* Register global <Space> shortcut --------------------------- */
    this.registerSpaceShortcut();
  }

  /** Tear everything down. */
  public destroy(): void {
    cancelAnimationFrame(this.loopId);
    this.audioPlayer?.destroy();
    this.pianoRoll?.destroy();

    if (this.spaceKeyHandler) {
      document.removeEventListener("keydown", this.spaceKeyHandler);
      this.spaceKeyHandler = null;
    }
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

    /* ------------------------------------------------------------
     * Build seek-bar first so other controls can reference the
     * updateSeekBar() helper via the shared dependencies object.
     * ---------------------------------------------------------- */
    this.seekBar = createSeekBar({
      audioPlayer: this.audioPlayer,
      pianoRoll: this.pianoRoll,
      formatTime,
    });

    /* ------------------------------------------------------------
     * Shared dependencies object consumed by all UI controls.
     * Only a subset of fields is actively used by current controls
     * (audioPlayer, pianoRoll, updateSeekBar, …) but we still
     * satisfy the full TypeScript contract to avoid compiler errors.
     * ---------------------------------------------------------- */
    const deps: UIComponentDependencies = {
      midiManager: null as unknown as any,
      audioPlayer: this.audioPlayer as any,
      pianoRoll: this.pianoRoll as any,
      filePanStateHandlers: {},
      filePanValues: {},
      muteDueNoLR: false,
      lastVolumeBeforeMute: 1,
      minorTimeStep: this.pianoRoll?.getMinorTimeStep?.() ?? 0.05,
      loopPoints: null,
      seeking: false,
      updateSeekBar: (state?: { currentTime: number; duration: number }) => {
        if (state) {
          this.seekBar.update(state.currentTime, state.duration, null);
        } else {
          const s = this.audioPlayer.getState();
          this.seekBar.update(s.currentTime, s.duration, null);
        }
      },
      updatePlayButton: null,
      updateMuteState: () => {},
      openSettingsModal: () => {},
      formatTime,
    };

    /* Top row – buttons & sliders ------------------------------ */
    const row = document.createElement("div");
    row.style.cssText = `
      display:flex; align-items:center; gap:20px; flex-wrap:wrap;
    `;

    /* Playback */
    const playbackUI = createPlaybackControls(deps);
    row.appendChild(playbackUI);

    /* Loop (A-B) */
    const loopUI = createLoopControls(deps);
    row.appendChild(loopUI);

    /* Volume */
    if (this.options.showVolumeControl) {
      const volumeControl = createVolumeControl(deps);
      row.appendChild(volumeControl);
    }

    /* Tempo */
    if (this.options.showTempoControl) {
      const tempoControl = createTempoControl(deps);
      row.appendChild(tempoControl);
    }

    /* Zoom reset */
    if (this.options.showZoomControl) {
      const zoomControl = createZoomControls(deps);
      row.appendChild(zoomControl);
    }

    /* Settings modal trigger */
    if (this.options.showSettingsControl) {
      row.appendChild(createSettingsControl(deps));
    }

    /* Mount controls */
    this.controlsRoot.appendChild(row);
    this.controlsRoot.appendChild(this.seekBar.element);
  }

  /** 60 fps update-loop – keeps seek-bar in sync. */
  private startUpdateLoop(): void {
    const step = () => {
      const { currentTime, duration } = this.audioPlayer.getState();
      // Keep piano-roll playhead perfectly synced with audio even if Tone.Draw
      // callbacks are delayed (e.g., when the tab is throttled).
      this.pianoRoll.setTime(currentTime);
      // The seek-bar itself internally handles loop overlays via the
      // LoopControls component, so we pass `null` here.
      this.seekBar.update(currentTime, duration, null);
      this.loopId = requestAnimationFrame(step);
    };
    this.loopId = requestAnimationFrame(step);
  }

  /* ----------------------------------------------------------------
   * Global <Space> shortcut
   * ---------------------------------------------------------------- */
  private registerSpaceShortcut(): void {
    if (this.spaceKeyHandler) return; // already registered

    this.spaceKeyHandler = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!(event.code === "Space" || event.key === " ")) return;

      // Ignore if focus is inside an element that naturally consumes Space.
      const t = event.target as HTMLElement | null;
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement ||
        t instanceof HTMLAnchorElement ||
        t?.getAttribute("role") === "button" ||
        t?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      // Debounce to avoid double-toggles when key is pressed very quickly.
      if (this.isTogglingPlayback) return;
      this.isTogglingPlayback = true;

      const state = this.audioPlayer.getState();

      const finish = () => {
        // Immediately refresh seek-bar for snappy feedback.
        const s = this.audioPlayer.getState();
        this.seekBar.update(s.currentTime, s.duration, null);
        // Release debounce lock shortly after action completes.
        setTimeout(() => {
          this.isTogglingPlayback = false;
        }, 100);
      };

      if (state.isPlaying) {
        this.audioPlayer.pause();
        finish();
      } else {
        this.audioPlayer
          .play()
          .then(() => {
            // Ensure update loop is running.
            this.startUpdateLoop();
          })
          .catch((err) => {
            console.error("Failed to start playback via <Space>:", err);
          })
          .finally(finish);
      }
    };

    document.addEventListener("keydown", this.spaceKeyHandler);
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
