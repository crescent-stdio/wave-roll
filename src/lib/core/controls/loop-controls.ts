import { VisualizationEngine } from "@/core/visualization";
import { PLAYER_ICONS } from "@/assets/player-icons";
import { COLOR_PRIMARY, COLOR_A, COLOR_B } from "@/lib/core/constants";
import { PianoRollInstance } from "../visualization/piano-roll/types";
import { attachHoverBackground } from "@/core/controls/utils/hover-background";
import { isHexColorLight } from "@/core/controls/utils/color-contrast";

export interface LoopControlsDeps {
  audioPlayer: VisualizationEngine;
  pianoRoll: PianoRollInstance;
}

export interface LoopControlsHandles {
  element: HTMLElement;
  updateSeekBar: () => void;
}
/**
 * Build A-B loop control buttons (Loop-Restart, A, B, Clear) and
 * internally manage loop point state.
 */
export function createCoreLoopControls(
  ctx: LoopControlsDeps
): LoopControlsHandles {
  const { audioPlayer, pianoRoll } = ctx;

  /* ------------------------------------------------------------------
   * Element setup
   * ------------------------------------------------------------------ */
  const container = document.createElement("div");
  container.style.cssText = `
    display: flex;
    gap: 6px;
    align-items: center;
    height: 48px;
    background: var(--panel-bg);
    padding: 4px 12px;
    border-radius: 8px;
    box-shadow: var(--shadow-sm);
  `;

  /* ------------------------------------------------------------------
   * Internal mutable state
   * ------------------------------------------------------------------ */
  let pointA: number | null = null;
  let pointB: number | null = null;
  let isLoopRestartActive = false;

  /* ------------------------------------------------------------------
   * Helper to create square text buttons (A, B, ✕)
   * ------------------------------------------------------------------ */
  const createLoopButton = (
    text: string,
    onClick: () => void,
    isActive = false
  ): HTMLButtonElement => {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.onclick = onClick;
    btn.style.cssText = `
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: ${isActive ? "rgba(37, 99, 235, 0.12)" : "transparent"};
      color: ${isActive ? "var(--accent)" : "var(--text-muted)"};
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    `;
    btn.classList.add("wr-focusable");
    attachHoverBackground(btn);
    if (isActive) btn.dataset.active = "true";
    return btn;
  };

  /* ------------------------------------------------------------------
   * Restart / Loop toggle button (icon)
   * ------------------------------------------------------------------ */
  const btnLoopRestart = document.createElement("button");
  btnLoopRestart.innerHTML = PLAYER_ICONS.loop_restart;
  btnLoopRestart.title = "Toggle A-B Loop Mode";
  btnLoopRestart.style.cssText = `
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  `;
  btnLoopRestart.classList.add("wr-focusable");
  const setLoopRestartUI = () => {
    if (isLoopRestartActive) {
      btnLoopRestart.dataset.active = "true";
      btnLoopRestart.style.background = "rgba(37, 99, 235, 0.12)";
      btnLoopRestart.style.color = "var(--accent)";
      btnLoopRestart.setAttribute("aria-pressed", "true");
    } else {
      delete btnLoopRestart.dataset.active;
      btnLoopRestart.style.background = "transparent";
      btnLoopRestart.style.color = "var(--text-muted)";
      btnLoopRestart.setAttribute("aria-pressed", "false");
    }
  };
  attachHoverBackground(btnLoopRestart);
  btnLoopRestart.onclick = () => {
    isLoopRestartActive = !isLoopRestartActive;
    setLoopRestartUI();
    // Toggle transport repeat to actually loop the selected window
    audioPlayer?.toggleRepeat?.(isLoopRestartActive);

    if (isLoopRestartActive) {
      // Always set loop window; prefer jumping to A (if defined)
      if (pointA !== null || pointB !== null) {
        const st = audioPlayer?.getState();
        audioPlayer?.setLoopPoints(pointA, pointB, false);
        if (pointA !== null) {
          // setLoopPoints with preservePosition=false already repositions to A
          if (st && !st.isPlaying) {
            audioPlayer?.play();
          }
        }
      }
    } else {
      // Disable loop but preserve current position
      audioPlayer?.setLoopPoints(null, null, true);
    }
    // Refresh seek bar overlay to reflect current loop state
    updateSeekBar();
  };

  /* ------------------------------------------------------------------
   * A button
   * ------------------------------------------------------------------ */
  const btnA = createLoopButton("A", () => {
    const state = audioPlayer?.getState();
    if (!state) return;
    pointA = state.currentTime;
    if (pointB !== null && pointA !== null && pointA > pointB) [pointA, pointB] = [pointB, pointA];
    // Debug log for index.html: record A marker set
    try {
      const pr = state.playbackRate ?? 100;
      const speed = pr / 100;
      const effectiveDuration = speed > 0 ? state.duration / speed : state.duration;
      const pct = effectiveDuration > 0 ? (pointA / effectiveDuration) * 100 : 0;
      // eslint-disable-next-line no-console
      console.log('[LoopControls] Set A marker', { timeSec: pointA, percent: pct });
    } catch {}
    // Style
    btnA.dataset.active = "true";
    btnA.setAttribute("aria-pressed", "true");
    btnA.style.background = COLOR_A;
    // Dynamic text color for contrast on sky/rose etc.
    btnA.style.color = isHexColorLight(COLOR_A) ? "black" : "white";
    btnA.style.fontWeight = "800";
    btnA.style.border = "none";  // Remove border when active
    // Reset B if undefined
    if (pointB === null) {
      btnB.dataset.active = "";
      btnB.setAttribute("aria-pressed", "false");
      btnB.style.background = "transparent";
      btnB.style.color = "var(--text-muted)";
      btnB.style.border = `2px solid ${COLOR_B}`;  // Show B border when inactive
    }
    // Do not touch the engine when setting markers (no play/seek).
    // Update only UI (overlay/markers).
    updateSeekBar();
  });
  // Add default border to A button
  btnA.style.border = `2px solid ${COLOR_A}`;

  /* ------------------------------------------------------------------
   * B button
   * ------------------------------------------------------------------ */
  const btnB = createLoopButton("B", () => {
    const state = audioPlayer?.getState();
    if (!state) return;
    pointB = state.currentTime;
    if (pointA !== null && pointB !== null && pointA > pointB) [pointA, pointB] = [pointB, pointA];
    btnB.dataset.active = "true";
    btnB.setAttribute("aria-pressed", "true");
    btnB.style.background = COLOR_B;
    btnB.style.color = isHexColorLight(COLOR_B) ? "black" : "white";
    btnB.style.fontWeight = "800";
    btnB.style.border = "none";  // Remove border when active
    // Debug log for index.html: record B marker set
    try {
      const pr = state.playbackRate ?? 100;
      const speed = pr / 100;
      const effectiveDuration = speed > 0 ? state.duration / speed : state.duration;
      const pct = effectiveDuration > 0 ? (pointB / effectiveDuration) * 100 : 0;
      // eslint-disable-next-line no-console
      console.log('[LoopControls] Set B marker', { timeSec: pointB, percent: pct });
    } catch {}
    updateSeekBar();
  });
  // Add default border to B button
  btnB.style.border = `2px solid ${COLOR_B}`;

  /* ------------------------------------------------------------------
   * Clear button
   * ------------------------------------------------------------------ */
  const btnClear = createLoopButton("✕", () => {
    pointA = null;
    pointB = null;
    btnA.dataset.active = "";
    btnB.dataset.active = "";
    btnA.setAttribute("aria-pressed", "false");
    btnB.setAttribute("aria-pressed", "false");
    btnA.style.background = "transparent";
    btnA.style.color = "var(--text-muted)";
    btnA.style.border = `2px solid ${COLOR_A}`;  // Restore A border
    btnB.style.background = "transparent";
    btnB.style.color = "var(--text-muted)";
    btnB.style.border = `2px solid ${COLOR_B}`;  // Restore B border
    // Always preserve current position when clearing loop
    audioPlayer?.setLoopPoints(null, null, true);
    pianoRoll?.setLoopWindow?.(null, null);
    // Keep UI in sync with current playback position
    const st = audioPlayer?.getState();
    if (st?.isPlaying) {
      audioPlayer?.seek(st.currentTime, true);
    }
    updateSeekBar();
  });
  btnClear.style.fontSize = "16px";
  btnClear.title = "Clear A-B Loop";

  /* ------------------------------------------------------------------
   * Seek-bar sync helper (exposes loop region data on ctx)
   * ------------------------------------------------------------------ */
  const updateSeekBar = () => {
    const state = audioPlayer?.getState();
    if (!state) return;

    // Compute effective UI duration using max(MIDI, WAV) and playbackRate
    const pr = state.playbackRate ?? 100;
    const speed = pr / 100;
    const midiDur = state.duration || 0;
    let wavMax = 0;
    try {
      const api = (globalThis as unknown as { _waveRollAudio?: { getFiles?: () => Array<{ audioBuffer?: AudioBuffer }> } })._waveRollAudio;
      const files = api?.getFiles?.() || [];
      const durations = files.map((f) => f.audioBuffer?.duration || 0).filter((d) => d > 0);
      wavMax = durations.length > 0 ? Math.max(...durations) : 0;
    } catch {}
    const rawMax = Math.max(midiDur, wavMax);
    const effectiveDuration = speed > 0 ? (rawMax > 0 ? rawMax / speed : 0) : rawMax;
    if (effectiveDuration <= 0) return;

    // percent positions or null
    const loopInfo: { a: number | null; b: number | null } = {
      a: null,
      b: null,
    };

    if (pointA !== null) {
      let start = pointA;
      let end = pointB;
      if (end !== null && start > end) [start, end] = [end, start];
      const clampedStart = Math.min(Math.max(0, start), effectiveDuration);
      const clampedEnd = end !== null ? Math.min(Math.max(0, end), effectiveDuration) : null;
      loopInfo.a = (clampedStart / effectiveDuration) * 100;
      loopInfo.b = clampedEnd !== null ? (clampedEnd / effectiveDuration) * 100 : null;
      pianoRoll?.setLoopWindow?.(clampedStart, clampedEnd);
    } else if (pointB !== null) {
      const clampedB = Math.min(Math.max(0, pointB), effectiveDuration);
      loopInfo.b = (clampedB / effectiveDuration) * 100;
      pianoRoll?.setLoopWindow?.(null, clampedB);
    } else {
      pianoRoll?.setLoopWindow?.(null, null);
    }

    /* ---------------------------------------------------------------
     * Notify parent components (e.g. seek-bar) so they can refresh the
     * loop overlay.  We bubble the event so that listeners do not need
     * an explicit reference to this component.
     * ------------------------------------------------------------- */
    const loopWindow =
      loopInfo.a === null && loopInfo.b === null
        ? null
        : ({ prev: loopInfo.a, next: loopInfo.b } as const);

    container.dispatchEvent(
      new CustomEvent("wr-loop-update", {
        detail: { loopWindow },
        bubbles: true,
        composed: true,
      })
    );
  };

  /* ------------------------------------------------------------------
   * Initial UI / append
   * ------------------------------------------------------------------ */
  setLoopRestartUI();
  container.appendChild(btnLoopRestart);
  container.appendChild(btnA);
  container.appendChild(btnB);
  container.appendChild(btnClear);

  // Delay first sync to let seek bar build elsewhere
  setTimeout(() => updateSeekBar(), 100);

  return { element: container, updateSeekBar };
}
