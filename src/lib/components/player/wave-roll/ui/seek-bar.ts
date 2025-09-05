import { clamp } from "@/core/utils";
import { AudioPlayerContainer } from "@/lib/core/audio/audio-player";
import { updateLoopDisplay } from "./loop-display";
import { COLOR_A, COLOR_B } from "@/lib/core/constants";
import { createMarker } from "./marker";

/** Loop window expressed in percentage (0-100) relative to the full track. */
export interface LoopWindow {
  prev: number | null;
  next: number | null;
}

export interface SeekBarDeps {
  /** Audio player - used for seek / drag */
  audioPlayer: AudioPlayerContainer | null;
  /** Optional: piano roll instance to forward loop markers */
  pianoRoll?: { setLoopWindow?: (a: number | null, b: number | null) => void };
  /** HH:MM formatter injected from caller to avoid duplication */
  formatTime: (seconds: number) => string;
}

export interface SeekBarInstance {
  /** <div> element (root) - append to the DOM. */
  element: HTMLElement;
  /**
   * Update visual state (progress + loop markers).
   * Should be called inside the player’s update‑loop.
   */
  update: (current: number, duration: number, loop: LoopWindow | null) => void;
}

export function createSeekBar(deps: SeekBarDeps): SeekBarInstance {
  const { audioPlayer, pianoRoll, formatTime } = deps;

  const calculateEffectiveDuration = (duration: number, playbackRate: number): number => {
    const speed = playbackRate / 100;
    return speed > 0 ? duration / speed : duration;
  };

  /* ---- DOM skeleton ------------------------------------------------ */
  const root = document.createElement("div");
  root.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 12px;
    background: var(--surface);
    border-radius: 8px;
  `;

  const labelCurrent = document.createElement("span");
  labelCurrent.style.cssText =
    "font-family: monospace; font-size: 12px; min-width:46px; text-align:right; color: var(--text-muted);";
  labelCurrent.textContent = "00:00";

  const barWrap = document.createElement("div");
  barWrap.style.cssText =
    "flex:1; position:relative; height:8px; background: var(--track-bg); border-radius:8px; cursor:pointer;";

  const progress = document.createElement("div");
  progress.style.cssText =
    "position:absolute; top:0; left:0; height:100%; width:0%; background: var(--accent); border-radius:8px; transition:none;";
  barWrap.appendChild(progress);

  /* Loop region (gold stripes) */
  const loopRegion = document.createElement("div");
  loopRegion.style.cssText = `
    position:absolute; top:0; height:100%;
    background: repeating-linear-gradient(
      -45deg,
      var(--loop-stripe-a) 0px,
      var(--loop-stripe-a) 4px,
      var(--loop-stripe-b) 4px,
      var(--loop-stripe-b) 8px
    );
    border-top:2px solid var(--loop-stripe-border);
    border-bottom:2px solid var(--loop-stripe-border);
    border-left:2px solid var(--loop-stripe-border);
    border-right:2px solid var(--loop-stripe-border);
    display:none;
    pointer-events:none;
    z-index:1;
    border-radius:8px;
  `;
  barWrap.appendChild(loopRegion);

  /* -------------------------------------------------------------
   * Markers A / B are created using the shared createMarker function
   * which handles CSS injection and styling
   * ----------------------------------------------------------- */

  const markerA = createMarker("A", COLOR_A, "wr-seekbar-marker-a");
  const markerB = createMarker("B", COLOR_B, "wr-seekbar-marker-b");
  barWrap.appendChild(markerA);
  barWrap.appendChild(markerB);
  /* --------------------------------------------------------------------- */

  // Helper to sync loop overlay + piano-roll marker -------------------------
  const updateLoopOverlay = (loop: LoopWindow | null, duration: number) => {
    // console.log("[SeekBar] overlay", { loop, duration });
    // Don't show loop markers when there's no valid duration (no files loaded)
    if (duration <= 0) {
      updateLoopDisplay({
        loopPoints: null,
        loopRegion,
        markerA,
        markerB,
      });
      return;
    }

    // Map to LoopDisplay format (a/b in percent)
    const loopPoints = loop ? { a: loop.prev, b: loop.next } : null;

    updateLoopDisplay({
      loopPoints,
      loopRegion,
      markerA,
      markerB,
    });

    // Keep piano-roll shaded region in sync (seconds)
    if (pianoRoll) {
      if (loop && duration > 0) {
        const startSec =
          loop.prev !== null ? (loop.prev / 100) * duration : null;
        const endSec = loop.next !== null ? (loop.next / 100) * duration : null;
        pianoRoll.setLoopWindow?.(startSec, endSec);
      } else {
        pianoRoll.setLoopWindow?.(null, null);
      }
    }
  };
  /* ----------------------------------------------------------------
   * Native range slider (transparent track) - the thumb handles user
   * interactions while custom divs render progress & loop overlays.
   * ---------------------------------------------------------------- */

  // Inject global CSS once for vendor-prefixed slider styling
  const styleId = "wr-seekbar-css";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      input.wr-slider {
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        width: 100%;
        height: 8px;
        cursor: pointer;
        position: absolute;
        top: 0;
        left: 0;
        margin: 0; /* Firefox default offset */
        z-index: 4; /* Above loop overlay and markers */
      }

      /* WebKit track */
      input.wr-slider::-webkit-slider-runnable-track {
        background: transparent;
        height: 8px;
      }
      /* WebKit thumb */
      input.wr-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        height: 14px;
        width: 14px;
        background: var(--accent-strong);
        border: 2px solid #fff;
        border-radius: 50%;
        margin-top: -3px; /* Center thumb vertically (14-8)/-2 */
        opacity: 0;
        transition: opacity .15s;
      }
      input.wr-slider:hover::-webkit-slider-thumb,
      input.wr-slider:active::-webkit-slider-thumb {
        opacity: 1;
      }

      /* Firefox track */
      input.wr-slider::-moz-range-track {
        background: transparent;
        height: 8px;
      }
      /* Firefox thumb */
      input.wr-slider::-moz-range-thumb {
        height: 14px;
        width: 14px;
        background: var(--accent-strong);
        border: 2px solid #fff;
        border-radius: 50%;
        opacity: 0;
        transition: opacity .15s;
      }
      input.wr-slider:hover::-moz-range-thumb,
      input.wr-slider:active::-moz-range-thumb {
        opacity: 1;
      }
    `;
    document.head.appendChild(style);

    // Ensure the slider thumb (round handle) is always visible,
    // so the user can track it in real-time while dragging.
    const overrideId = "wr-seekbar-css-override";
    if (!document.getElementById(overrideId)) {
      const overrideStyle = document.createElement("style");
      overrideStyle.id = overrideId;
      overrideStyle.textContent = `
        input.wr-slider::-webkit-slider-thumb,
        input.wr-slider::-moz-range-thumb {
          opacity: 1 !important;
        }
      `;
      document.head.appendChild(overrideStyle);
    }
  }

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "0.1";
  slider.value = "0";
  slider.className = "wr-slider wr-focusable";
  barWrap.appendChild(slider);

  // No separate tooltip; the progress bar itself will reflect dragging.

  const labelTotal = document.createElement("span");
  labelTotal.style.cssText =
    "font-family: monospace; font-size: 12px; min-width:46px;";
  labelTotal.textContent = "00:00";

  root.appendChild(labelCurrent);
  root.appendChild(barWrap);
  root.appendChild(labelTotal);

  /* ---- Seeking interaction ---------------------------------------- */
  /* Slider handles all pointer events natively */
  let isDragging = false;

  slider.addEventListener("pointerdown", (e: PointerEvent) => {
    // console.log("%c[SB] down", "color:#2b90d9", {
    //   pct: slider.value,
    //   seconds:
    //     (Number(slider.value) / 100) * (audioPlayer?.getState().duration ?? 0),
    // });

    isDragging = true;
    slider.setPointerCapture(e.pointerId);

    // Show initial value immediately
    const pct01 = Number(slider.value) / 100;
    const st = audioPlayer ? audioPlayer.getState() : null;
    const pr = st?.playbackRate ?? 100;
    const effectiveDuration = st ? calculateEffectiveDuration(st.duration, pr) : 0;
    labelCurrent.textContent = formatTime(pct01 * effectiveDuration);
  });

  // Apply the seek only once the user releases the pointer. This prevents
  // multiple heavy Tone.js operations while scrubbing, which previously
  // caused audible glitches.
  const commitSeek = () => {
    if (!isDragging || !audioPlayer) return;

    isDragging = false;

    const pct = Number(slider.value);
    const pct01 = pct / 100;
    const st = audioPlayer.getState();
    const pr = st.playbackRate ?? 100;
    const effectiveDuration = calculateEffectiveDuration(st.duration, pr);
    const targetSec = pct01 * effectiveDuration;
    console.info("[UI-seek] requested", {
      targetSec,
      pct,
      effectiveDuration,
      playbackRate: pr,
    });
    audioPlayer.seek(targetSec);
  };

  slider.addEventListener("pointerup", (e: PointerEvent) => {
    slider.releasePointerCapture(e.pointerId);
    commitSeek();
  });

  slider.addEventListener("pointercancel", commitSeek);
  slider.addEventListener("pointerleave", commitSeek);

  // While dragging, simply update the visuals (thumb + time label) without
  // invoking expensive seek logic on every `input` event.
  slider.addEventListener("input", () => {
    // console.log("%c[SB] input", "color:#2b90d9", { pct: slider.value });
    const pct = Number(slider.value); // 0-100
    const pct01 = pct / 100;
    const st = audioPlayer?.getState();
    const pr = st?.playbackRate ?? 100;
    const effectiveDuration = st ? calculateEffectiveDuration(st.duration, pr) : 0;
    progress.style.width = `${pct}%`;
    labelCurrent.textContent = formatTime(pct01 * effectiveDuration);
  });

  /* ---- Update function -------------------------------------------- */
  type UpdateFn = ((
    current: number,
    duration: number,
    loop: LoopWindow | null
  ) => void) & {
    prev?: number;
  };

  const update: UpdateFn = (
    current: number,
    duration: number,
    loop: LoopWindow | null
  ) => {
    // check flicker
    if (typeof update.prev === "number") {
      const diff = current - update.prev;
      if (diff < -0.05) {
        // Flicker when jumping backward more than 50 ms
        console.warn("[SB] backward jump!", {
          from: update.prev.toFixed(3),
          to: current.toFixed(3),
        });
      }
    }
    update.prev = current;

    // console.log("[SeekBar.update]", current.toFixed(3));

    // duration argument is engine-provided effectiveDuration. Use it for totals.
    labelCurrent.textContent = formatTime(current);
    labelTotal.textContent = formatTime(duration);

    const pctRaw = duration > 0 ? (current / duration) * 100 : 0;
    const pct = clamp(pctRaw, 0, 100);
    progress.style.width = `${pct}%`;
    slider.value = pct.toFixed(2);

    // If the user is actively dragging the thumb we skip updating the
    // progress indicator coming from the audio engine. This prevents a fight
    // between the pointer-driven UI state and the engine-driven visual state
    // that results in visible jitter / flicker of the seek bar and piano-roll
    // overlays during scrubbing.
    if (isDragging) {
      /* loop overlay still needs to stay in sync with external changes
         (e.g. programmatic loop-window updates). We therefore update only the
         loop UI parts while leaving the progress bar untouched. */
      updateLoopOverlay(loop, duration);

      return; // Skip the rest of the update while dragging
    }

    // No extra handling; realtime updates occur in slider input handler.

    /* loop overlay */
    updateLoopOverlay(loop, duration);
    // console.log("[SeekBar.update] end", {
    //   current: current.toFixed(3),
    //   duration: duration.toFixed(3),
    //   loop: loop,
    // });
  };

  return { element: root, update };
}
