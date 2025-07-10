import { PLAYER_ICONS } from "@/assets/player-icons";
import { COLOR_A, COLOR_B, COLOR_PRIMARY } from "@/lib/core/constants";
import { UIComponentDependencies } from "../types";

/**
 * Create a loop control element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The loop control element.
 */
export function createLoopControls(
  dependencies: UIComponentDependencies
): HTMLElement {
  const { audioPlayer, pianoRoll } = dependencies;

  const container = document.createElement("div");
  container.style.cssText = `
      display: flex;
      gap: 6px;
      align-items: center;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px;
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    `;

  // Virtual A-B points (in seconds)
  let pointA: number | null = null;
  let pointB: number | null = null;
  let isLooping = false;
  let isLoopRestartActive = false;

  // Create button helper
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

    btn.addEventListener("mouseenter", () => {
      if (!btn.dataset.active) {
        btn.style.background = "rgba(0, 0, 0, 0.05)";
      }
    });
    btn.addEventListener("mouseleave", () => {
      if (!btn.dataset.active) {
        btn.style.background = "transparent";
      }
    });

    if (isActive) {
      btn.dataset.active = "true";
    }

    return btn;
  };

  // Loop restart button
  const btnLoopRestart = document.createElement("button");
  btnLoopRestart.innerHTML = PLAYER_ICONS.loop_restart;
  btnLoopRestart.onclick = () => {
    isLoopRestartActive = !isLoopRestartActive;

    if (isLoopRestartActive) {
      btnLoopRestart.dataset.active = "true";
      btnLoopRestart.style.background = "rgba(0, 123, 255, 0.1)";
      btnLoopRestart.style.color = COLOR_PRIMARY;

      if (pointA !== null && pointB !== null) {
        dependencies.audioPlayer?.setLoopPoints(pointA, pointB);
      } else if (pointA !== null) {
        dependencies.audioPlayer?.setLoopPoints(pointA, null);
      }

      const startPoint = pointA !== null ? pointA : 0;
      dependencies.audioPlayer?.seek(startPoint);
      if (!dependencies.audioPlayer?.getState().isPlaying) {
        dependencies.audioPlayer?.play();
      }
    } else {
      delete btnLoopRestart.dataset.active;
      btnLoopRestart.style.background = "transparent";
      btnLoopRestart.style.color = "#495057";
      dependencies.audioPlayer?.setLoopPoints(null, null);
    }
  };
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
  btnLoopRestart.title = "Toggle A-B Loop Mode";

  btnLoopRestart.addEventListener("mouseenter", () => {
    if (!btnLoopRestart.dataset.active) {
      btnLoopRestart.style.background = "rgba(0, 0, 0, 0.05)";
    }
  });
  btnLoopRestart.addEventListener("mouseleave", () => {
    if (!btnLoopRestart.dataset.active) {
      btnLoopRestart.style.background = "transparent";
    }
  });

  // A and B buttons
  const btnA = createLoopButton(
    "A",
    () => {
      const state = dependencies.audioPlayer?.getState();
      if (state) {
        pointA = state.currentTime;
        btnA.style.background = COLOR_A;
        btnA.style.color = "white";
        btnA.dataset.active = "true";
        dependencies.updateSeekBar?.();
      }
    },
    false
  );

  const btnB = createLoopButton(
    "B",
    () => {
      const state = dependencies.audioPlayer?.getState();
      if (state) {
        pointB = state.currentTime;
        btnB.style.background = COLOR_B;
        btnB.style.color = "white";
        btnB.dataset.active = "true";
        dependencies.updateSeekBar?.();
      }
    },
    false
  );

  // Clear button
  const btnClear = createLoopButton("✕", () => {
    pointA = null;
    pointB = null;
    isLooping = false;
    btnA.style.background = "transparent";
    btnA.style.color = "#495057";
    delete btnA.dataset.active;
    btnB.style.background = "transparent";
    btnB.style.color = "#495057";
    delete btnB.dataset.active;
    dependencies.updateSeekBar?.();
  });
  btnClear.style.fontSize = "16px";
  btnClear.title = "Clear A-B Loop";

  container.appendChild(btnLoopRestart);
  container.appendChild(btnA);
  container.appendChild(btnB);
  container.appendChild(btnClear);

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
  };

  // TODO: remove this once we have a proper sync mechanism
  setTimeout(() => updateSeekBar(), 100);

  return container;
}
