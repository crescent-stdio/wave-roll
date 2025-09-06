import { AudioPlayerContainer } from "@/lib/core/audio/audio-player";
import { PLAYER_ICONS } from "@/assets/player-icons";
import { COLOR_A } from "@/lib/core/constants";

export interface ABLoopDeps {
  audioPlayer: AudioPlayerContainer;
  pianoRoll: { setLoopWindow?: (a: number | null, b: number | null) => void };
}

export interface ABLoopAPI {
  /** Root <div> to append in UI */
  element: HTMLElement;
  /** Returns { a:%|null, b:%|null } (0-100) for seek-bar overlay */
  getLoopPoints: () => { a: number | null; b: number | null } | null;
  /** Clear A·B points programmatically */
  clear: () => void;
}

export function createABLoopControls(deps: ABLoopDeps): ABLoopAPI {
  const { audioPlayer, pianoRoll } = deps;

  /* internal state (percent of effective duration, 0-100) */
  let pointAPct: number | null = null;
  let pointBPct: number | null = null;
  let loopRestart = false;

  /* ---------- build DOM ---------- */
  const root = document.createElement("div");
  root.style.cssText =
    "display:flex;gap:6px;align-items:center;height:48px;" +
    "background:rgba(255,255,255,.8);padding:4px;border-radius:8px;";

  const makeBtn = (
    onClick: () => void,
    label?: string,
    icon?: string
  ): HTMLButtonElement => {
    const b = document.createElement("button");
    if (label) b.textContent = label;
    if (icon) b.innerHTML = icon;
    b.onclick = onClick;
    b.style.cssText =
      "width:32px;height:32px;border:none;border-radius:8px;" +
      "background:transparent;color:#495057;cursor:pointer;font-weight:600;";
    return b;
  };

  /* Loop-Restart */
  const restartBtn = makeBtn(
    () => {
      // Toggle requested state, but validate A/B before applying
      const next = !loopRestart;
      if (next) {
        // Require both A and B to enable loop
        if (pointAPct === null || pointBPct === null) {
          // No-op, keep disabled
          return;
        }
        // Enabling: apply loop to engine, jump to A
        applyLoopToEngine(true);
        loopRestart = true;
      } else {
        // Disabling: clear engine loop, keep position
        applyLoopToEngine(false);
        loopRestart = false;
      }
      // Reflect UI state
      restartBtn.dataset.active = loopRestart ? "true" : "";
      restartBtn.style.background = loopRestart ? "rgba(0,123,255,.1)" : "transparent";
      restartBtn.style.color = loopRestart ? "#007bff" : "#495057";
      // Always refresh overlay
      updateSeekBar();
    },
    undefined,
    PLAYER_ICONS.loop_restart
  );

  /* A & B buttons */
  const btnA = makeBtn(() => setPoint("A"), "A");
  const btnB = makeBtn(() => setPoint("B"), "B");
  const btnClear = makeBtn(clear, "X");

  root.append(restartBtn, btnA, btnB, btnClear);

  /* ---------- helpers ---------- */
  function getEffectiveDurationForUI(): number {
    try {
      const st = audioPlayer.getState();
      const pr = st.playbackRate ?? 100;
      const speed = pr / 100;
      const midiDur = st.duration || 0;
      let wavMax = 0;
      try {
        const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ audioBuffer?: AudioBuffer }> } })._waveRollAudio;
        const files = api?.getFiles?.() || [];
        const durations = files.map((f) => f.audioBuffer?.duration || 0).filter((d) => d > 0);
        wavMax = durations.length > 0 ? Math.max(...durations) : 0;
      } catch {}
      const rawMax = Math.max(midiDur, wavMax);
      return speed > 0 ? rawMax / speed : rawMax;
    } catch {
      return audioPlayer.getState().duration;
    }
  }
  function setPoint(kind: "A" | "B") {
    const state = audioPlayer.getState();
    const t = state.currentTime;
    const effectiveDuration = getEffectiveDurationForUI();
    if (effectiveDuration <= 0) return;
    const pct = (t / effectiveDuration) * 100;

    // console.log(`[AB-Loop] Setting point ${kind}:`, {
    //   currentTime: t,
    //   duration: state.duration,
    //   percent: (t / state.duration) * 100
    // });

    if (kind === "A") pointAPct = pct;
    else pointBPct = pct;

    // keep A <= B
    if (pointAPct !== null && pointBPct !== null && pointAPct > pointBPct) {
      [pointAPct, pointBPct] = [pointBPct, pointAPct];
    }
    // Update UI overlays only; do NOT touch engine until loop button is enabled
    applyMarkersToUI();
    updateSeekBar();
  }

  function applyMarkersToUI() {
    const dur = getEffectiveDurationForUI();
    const toSec = (p: number | null) => (p !== null ? (p / 100) * dur : null);
    pianoRoll.setLoopWindow?.(toSec(pointAPct), toSec(pointBPct));
  }

  function applyLoopToEngine(enable: boolean) {
    if (enable) {
      // Enable loop only if both markers exist and valid
      if (pointAPct === null || pointBPct === null) return;
      const dur = getEffectiveDurationForUI();
      if (dur <= 0) return;
      const start = (pointAPct / 100) * dur;
      const end = (pointBPct / 100) * dur;
      // Jump to A and start loop (preservePosition=false)
      audioPlayer.setLoopPoints(start, end, false);
    } else {
      // Clear loop, preserve current position
      audioPlayer.setLoopPoints(null, null, true);
    }
  }

  /* ---------------------------------------------------------------
   * Seek-bar sync helper - fires `wr-loop-update` so external
   * listeners (e.g. Player) can redraw the loop overlay.
   * Mirrors the implementation used by the new core controls.
   * ------------------------------------------------------------- */
  function updateSeekBar(): void {
    const state = audioPlayer.getState();
    if (!state || state.duration === 0) return;

    const loopWindow =
      pointAPct === null && pointBPct === null
        ? null
        : ({ prev: pointAPct, next: pointBPct } as const);

    // console.log("[AB-Loop] Sending loop update:", {
    //   pointA,
    //   pointB,
    //   start,
    //   end,
    //   loopWindow,
    //   duration: state.duration,
    // });

    // Bubble event so parent player updates seek-bar
    root.dispatchEvent(
      new CustomEvent("wr-loop-update", {
        detail: { loopWindow },
        bubbles: true,
      })
    );
  }

  // --------------------------------------------------------------
  // Call update helper after initial render so existing loop points
  // (if any) appear on seek-bar immediately.
  // --------------------------------------------------------------
  setTimeout(updateSeekBar, 0);

  function clear() {
    pointAPct = pointBPct = null;
    loopRestart = false;
    // Preserve position when clearing loop from UI
    audioPlayer.setLoopPoints(null, null, true);
    pianoRoll.setLoopWindow?.(null, null);
    restartBtn.dataset.active = "";
    restartBtn.style.background = "transparent";
    restartBtn.style.color = "#495057";

    updateSeekBar();
  }

  /* ---------- public API ---------- */
  const getLoopPoints = () => {
    if (pointAPct === null && pointBPct === null) return null;
    return { a: pointAPct, b: pointBPct };
  };

  return { element: root, getLoopPoints, clear };
}
