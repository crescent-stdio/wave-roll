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
    btnA.setAttribute("aria-pressed", "true");
    btnA.style.background = COLOR_A;
    // Dynamic text color for contrast on sky/rose etc.
    const isLight = (() => {
      const hex = COLOR_A.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const srgb = [r, g, b].map((v) =>
        v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      );
      const L = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
      return L > 0.5;
    })();
    btnA.style.color = isLight ? "black" : "white";
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
    updateSeekBar();
    if (pointA !== null) {
      pianoRoll?.setTime?.(pointA);
    }
  });
  // Add default border to A button
  btnA.style.border = `2px solid ${COLOR_A}`;

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
    btnB.setAttribute("aria-pressed", "true");
    btnB.style.background = COLOR_B;
    const isLightB = (() => {
      const hex = COLOR_B.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const srgb = [r, g, b].map((v) =>
        v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      );
      const L = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
      return L > 0.5;
    })();
    btnB.style.color = isLightB ? "black" : "white";
    btnB.style.fontWeight = "800";
    btnB.style.border = "none";  // Remove border when active
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
