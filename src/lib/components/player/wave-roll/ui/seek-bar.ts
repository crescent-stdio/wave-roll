import { clamp } from "@/core/utils";
import { AudioPlayerContainer } from "@/lib/core/audio/audio-player";
import { updateLoopDisplay } from "./loop-display";
import { COLOR_A, COLOR_B } from "@/lib/core/constants";

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

  /* ---- DOM skeleton ------------------------------------------------ */
  const root = document.createElement("div");
  root.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px 12px;
    background: #ffffff;
    border-radius: 8px;
  `;

  const labelCurrent = document.createElement("span");
  labelCurrent.style.cssText =
    "font-family: monospace; font-size: 12px; min-width:46px; text-align:right;";
  labelCurrent.textContent = "00:00";

  const barWrap = document.createElement("div");
  barWrap.style.cssText =
    "flex:1; position:relative; height:8px; background:#e9ecef; border-radius:8px; cursor:pointer;";

  const progress = document.createElement("div");
  progress.style.cssText =
    "position:absolute; top:0; left:0; height:100%; width:0%; background:#4285f4; border-radius:8px; transition:none;";
  barWrap.appendChild(progress);

  /* Loop region (gold stripes) */
  const loopRegion = document.createElement("div");
  loopRegion.style.cssText = `
    position:absolute; top:0; height:100%;
    background: repeating-linear-gradient(
      -45deg,
      rgba(241,196,15,0.6) 0px,
      rgba(241,196,15,0.6) 4px,
      rgba(243,156,18,0.4) 4px,
      rgba(243,156,18,0.4) 8px
    );
    border-top:2px solid rgba(241,196,15,.9);
    border-bottom:2px solid rgba(241,196,15,.9);
    display:none;
    pointer-events:none;
    z-index:1;
    border-radius:8px;
  `;
  barWrap.appendChild(loopRegion);

  /* -------------------------------------------------------------
   * Markers A / B (label + small stem) reusable CSS
   * ----------------------------------------------------------- */
  const markerCssId = "wr-marker-css";
  if (!document.getElementById(markerCssId)) {
    const style = document.createElement("style");
    style.id = markerCssId;
    style.textContent = `
      .wr-marker {
        position: absolute;
        top: -24px;
        transform: translateX(-50%);
        font-family: monospace;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 4px;
        border-radius: 4px 4px 0 0;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 3;
      }
      .wr-marker::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        width: 2px;
        height: 30px; /* reach down to progress bar */
        background: currentColor;
      }
    `;
    document.head.appendChild(style);
  }

  const createMarker = (label: string, color: string, id: string) => {
    const el = document.createElement("div");
    el.id = id;
    el.className = "wr-marker";
    el.style.background = color; // box bg
    el.style.color = color; // currentColor -> stem uses this

    // Inner span to keep label text white
    const span = document.createElement("span");
    span.textContent = label;
    span.style.color = "#ffffff";
    el.appendChild(span);

    return el;
  };

  const markerA = createMarker("A", COLOR_A, "wr-seekbar-marker-a");
  const markerB = createMarker("B", COLOR_B, "wr-seekbar-marker-b");
  barWrap.appendChild(markerA);
  barWrap.appendChild(markerB);
  /* --------------------------------------------------------------------- */

  // Helper to sync loop overlay + piano-roll marker -------------------------
  const updateLoopOverlay = (loop: LoopWindow | null, duration: number) => {
    console.log("[SeekBar] overlay", { loop, duration });
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
        background: #4285f4;
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
        background: #4285f4;
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
  slider.className = "wr-slider";
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
    console.log("%c[SB] down", "color:#2b90d9", {
      pct: slider.value,
      seconds:
        (Number(slider.value) / 100) * (audioPlayer?.getState().duration ?? 0),
    });

    isDragging = true;
    slider.setPointerCapture(e.pointerId);

    // Show initial value immediately
    const pct01 = Number(slider.value) / 100;
    const durationSec = audioPlayer ? audioPlayer.getState().duration : 0;
    labelCurrent.textContent = formatTime(pct01 * durationSec);
  });

  // Apply the seek only once the user releases the pointer. This prevents
  // multiple heavy Tone.js operations while scrubbing, which previously
  // caused audible glitches.
  const commitSeek = () => {
    if (!isDragging || !audioPlayer) return;

    isDragging = false;

    const pct = Number(slider.value);
    const pct01 = pct / 100;
    const durationSec = audioPlayer.getState().duration;
    console.info("[UI-seek] requested", {
      targetSec: pct01 * durationSec,
    });
    audioPlayer.seek(pct01 * durationSec);
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
    console.log("%c[SB] input", "color:#2b90d9", { pct: slider.value });
    const pct = Number(slider.value); // 0-100
    const pct01 = pct / 100;
    const durationSec = audioPlayer?.getState().duration ?? 0;

    progress.style.width = `${pct}%`;
    labelCurrent.textContent = formatTime(pct01 * durationSec);
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
        // 50 ms 이상 뒤로 가면 플리커
        console.warn("[SB] backward jump!", {
          from: update.prev.toFixed(3),
          to: current.toFixed(3),
        });
      }
    }
    update.prev = current;

    console.log("[SeekBar.update]", current.toFixed(3));

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
    console.log("[SeekBar.update] end", {
      current: current.toFixed(3),
      duration: duration.toFixed(3),
      loop: loop,
    });
  };

  return { element: root, update };
}
