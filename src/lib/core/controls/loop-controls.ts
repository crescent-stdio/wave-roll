import { VisualizationEngine } from "@/core/visualization";
import { PLAYER_ICONS } from "@/assets/player-icons";
import { COLOR_PRIMARY, COLOR_A, COLOR_B } from "@/lib/core/constants";
import { PianoRollInstance } from "../visualization/piano-roll/types";
import { attachHoverBackground } from "@/core/controls/utils/hover-background";

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
    background: rgba(255, 255, 255, 0.8);
    padding: 4px 12px;
    border-radius: 8px;
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
      background: ${isActive ? "rgba(0, 123, 255, 0.1)" : "transparent"};
      color: ${isActive ? COLOR_PRIMARY : "#495057"};
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s ease;
    `;
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
    color: #495057;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  `;
  const setLoopRestartUI = () => {
    if (isLoopRestartActive) {
      btnLoopRestart.dataset.active = "true";
      btnLoopRestart.style.background = "rgba(0, 123, 255, 0.1)";
      btnLoopRestart.style.color = COLOR_PRIMARY;
    } else {
      delete btnLoopRestart.dataset.active;
      btnLoopRestart.style.background = "transparent";
      btnLoopRestart.style.color = "#495057";
    }
  };
  attachHoverBackground(btnLoopRestart);
  btnLoopRestart.onclick = () => {
    isLoopRestartActive = !isLoopRestartActive;
    setLoopRestartUI();

    if (isLoopRestartActive) {
      // Apply loop points immediately
      if (pointA !== null || pointB !== null) {
        audioPlayer?.setLoopPoints(pointA, pointB);
      }
      // Seek & play from start point
      const startPoint = pointA ?? 0;
      audioPlayer?.seek(startPoint);
      if (!audioPlayer?.getState().isPlaying) {
        audioPlayer?.play();
      }
    } else {
      audioPlayer?.setLoopPoints(null, null);
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
    // Style
    btnA.dataset.active = "true";
    btnA.style.background = COLOR_A;
    btnA.style.color = "white";
    btnA.style.fontWeight = "800";
    // Reset B if undefined
    if (pointB === null) {
      btnB.dataset.active = "";
      btnB.style.background = "transparent";
      btnB.style.color = "#495057";
    }
    updateSeekBar();
    if (pointA !== null) {
      pianoRoll?.setTime?.(pointA);
    }
  });

  /* ------------------------------------------------------------------
   * B button
   * ------------------------------------------------------------------ */
  const btnB = createLoopButton("B", () => {
    const state = audioPlayer?.getState();
    if (!state) return;
    if (pointA === null) {
      pointB = state.currentTime;
    } else {
      pointB = state.currentTime;
      if (pointA !== null && pointB < pointA) [pointA, pointB] = [pointB, pointA];
    }
    btnB.dataset.active = "true";
    btnB.style.background = COLOR_B;
    btnB.style.color = "white";
    btnB.style.fontWeight = "800";
    updateSeekBar();
  });

  /* ------------------------------------------------------------------
   * Clear button
   * ------------------------------------------------------------------ */
  const btnClear = createLoopButton("✕", () => {
    pointA = null;
    pointB = null;
    btnA.dataset.active = "";
    btnB.dataset.active = "";
    btnA.style.background = "transparent";
    btnA.style.color = "#495057";
    btnB.style.background = "transparent";
    btnB.style.color = "#495057";
    audioPlayer?.setLoopPoints(null, null);
    pianoRoll?.setLoopWindow?.(null, null);
    updateSeekBar();
  });
  btnClear.style.fontSize = "16px";
  btnClear.title = "Clear A-B Loop";

  /* ------------------------------------------------------------------
   * Seek-bar sync helper (exposes loop region data on ctx)
   * ------------------------------------------------------------------ */
  const updateSeekBar = () => {
    const state = audioPlayer?.getState();
    if (!state || state.duration === 0) return;

    // percent positions or null
    const loopInfo: { a: number | null; b: number | null } = {
      a: null,
      b: null,
    };

    if (pointA !== null) {
      let start = pointA;
      let end = pointB;
      if (end !== null && start > end) [start, end] = [end, start];
      const clampedEnd = end !== null ? Math.min(end, state.duration) : null;
      loopInfo.a = (start / state.duration) * 100;
      loopInfo.b =
        clampedEnd !== null ? (clampedEnd / state.duration) * 100 : null;

      if (isLoopRestartActive) audioPlayer?.setLoopPoints(start, clampedEnd);
      pianoRoll?.setLoopWindow?.(start, clampedEnd);
    } else if (pointB !== null) {
      const clampedB = Math.min(pointB, state.duration);
      loopInfo.b = (clampedB / state.duration) * 100;
      if (isLoopRestartActive) audioPlayer?.setLoopPoints(null, clampedB);
      pianoRoll?.setLoopWindow?.(null, clampedB);
    } else {
      if (isLoopRestartActive) audioPlayer?.setLoopPoints(null, null);
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
