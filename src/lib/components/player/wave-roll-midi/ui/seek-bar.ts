import { AudioPlayerControls } from "@/lib/core/audio/audio-player";

export interface SeekBarDeps {
  /** Audio player – used for seek / drag */
  audioPlayer: AudioPlayerControls | null;
  /** Optional: piano roll instance to forward loop markers */
  pianoRoll?: { setLoopWindow?: (a: number | null, b: number | null) => void };
  /** HH:MM formatter injected from caller to avoid duplication */
  formatTime: (seconds: number) => string;
}

export interface SeekBarInstance {
  /** <div> element (root) – append to the DOM. */
  element: HTMLElement;
  /**
   * Update visual state (progress + loop markers).
   * Should be called inside the player’s update‑loop.
   */
  update: (
    current: number,
    duration: number,
    loop: { a: number | null; b: number | null } | null
  ) => void;
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
    "position:absolute; top:0; left:0; height:100%; width:0%; background:#4285f4; border-radius:8px; transition:width .1s linear;";
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

  /* Seek handle (follows mouse) */
  const handle = document.createElement("div");
  handle.style.cssText = `
    position:absolute; top:50%; transform:translate(-50%,-50%);
    width:14px; height:14px; background:#4285f4; border-radius:8px;
    border:2px solid #fff; opacity:0; transition:opacity .15s;
    z-index:2;
  `;
  barWrap.appendChild(handle);

  const labelTotal = document.createElement("span");
  labelTotal.style.cssText =
    "font-family: monospace; font-size: 12px; min-width:46px;";
  labelTotal.textContent = "00:00";

  root.appendChild(labelCurrent);
  root.appendChild(barWrap);
  root.appendChild(labelTotal);

  /* ---- Seeking interaction ---------------------------------------- */
  let seeking = false;
  const seekTo = (px: number) => {
    if (!audioPlayer) return;
    const rect = barWrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (px - rect.left) / rect.width));
    audioPlayer.seek(pct * audioPlayer.getState().duration);
  };

  barWrap.addEventListener("mousedown", (e) => {
    seeking = true;
    handle.style.opacity = "1";
    seekTo(e.clientX);
    const move = (ev: MouseEvent) => seekTo(ev.clientX);
    const up = () => {
      seeking = false;
      handle.style.opacity = "0";
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
  barWrap.addEventListener("mouseenter", () => {
    if (!seeking) handle.style.opacity = "1";
  });
  barWrap.addEventListener("mouseleave", () => {
    if (!seeking) handle.style.opacity = "0";
  });

  /* ---- Update function -------------------------------------------- */
  const update = (
    current: number,
    duration: number,
    loop: { a: number | null; b: number | null } | null
  ) => {
    labelCurrent.textContent = formatTime(current);
    labelTotal.textContent = formatTime(duration);

    const pct = duration > 0 ? (current / duration) * 100 : 0;
    progress.style.width = `${pct}%`;
    handle.style.left = `${pct}%`;

    /* loop overlay */
    if (loop && loop.a !== null && loop.b !== null) {
      loopRegion.style.display = "block";
      loopRegion.style.left = `${loop.a}%`;
      loopRegion.style.width = `${loop.b - loop.a}%`;
    } else {
      loopRegion.style.display = "none";
    }

    if (loop && loop.a !== null && loop.b !== null) {
      /* forward to piano-roll overlay */
      pianoRoll?.setLoopWindow?.(
        (loop.a / 100) * duration,
        (loop.b / 100) * duration
      );
    } else {
      pianoRoll?.setLoopWindow?.(null, null);
    }
  };

  return { element: root, update };
}
