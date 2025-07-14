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

  /* internal state (seconds) */
  let pointA: number | null = null;
  let pointB: number | null = null;
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

  /* Loop-Restart ) */
  const restartBtn = makeBtn(
    () => {
      loopRestart = !loopRestart;
      restartBtn.dataset.active = loopRestart ? "true" : "";
      restartBtn.style.background = loopRestart
        ? "rgba(0,123,255,.1)"
        : "transparent";
      restartBtn.style.color = loopRestart ? "#007bff" : "#495057";
      // apply / clear loop on the player
      applyLoopToPlayer();
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
  function setPoint(kind: "A" | "B") {
    const t = audioPlayer.getState().currentTime;
    if (kind === "A") pointA = t;
    else pointB = t;

    // keep A <= B
    if (pointA !== null && pointB !== null && pointA > pointB) {
      [pointA, pointB] = [pointB, pointA];
    }
    applyLoopToPlayer();
    // Seek-bar will refresh via applyLoopToPlayer → updateSeekBar
  }

  function applyLoopToPlayer() {
    // Compute loop points in seconds → percent conversion happens only when
    // dispatching the `wr-loop-update` event.

    // forward to seek-bar overlay via public getter → handled by Player loop
    // forward to piano-roll shading
    pianoRoll.setLoopWindow?.(pointA, pointB);

    // audio loop only when restart-mode is active
    if (loopRestart) audioPlayer.setLoopPoints(pointA, pointB);
    else audioPlayer.setLoopPoints(null, null);

    // Notify seek-bar overlay to refresh via bubbling custom event
    updateSeekBar();
  }

  /* ---------------------------------------------------------------
   * Seek-bar sync helper - fires `wr-loop-update` so external
   * listeners (e.g. Player) can redraw the loop overlay.
   * Mirrors the implementation used by the new core controls.
   * ------------------------------------------------------------- */
  function updateSeekBar(): void {
    const state = audioPlayer.getState();
    if (!state || state.duration === 0) return;

    let start = pointA;
    let end = pointB;

    // Ensure chronological order
    if (start !== null && end !== null && start > end) {
      [start, end] = [end, start];
    }

    // Clamp within track duration
    const clamp = (v: number | null) =>
      v !== null ? Math.min(v, state.duration) : null;

    start = clamp(start);
    end = clamp(end);

    const toPct = (v: number | null) =>
      v !== null ? (v / state.duration) * 100 : null;

    const loopWindow =
      start === null && end === null
        ? null
        : ({ prev: toPct(start), next: toPct(end) } as const);

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
    pointA = pointB = null;
    loopRestart = false;
    audioPlayer.setLoopPoints(null, null);
    pianoRoll.setLoopWindow?.(null, null);
    restartBtn.dataset.active = "";
    restartBtn.style.background = "transparent";
    restartBtn.style.color = "#495057";

    updateSeekBar();
  }

  /* ---------- public API ---------- */
  const getLoopPoints = () => {
    if (pointA === null && pointB === null) return null;
    const dur = audioPlayer.getState().duration;
    return {
      a: pointA !== null ? (pointA / dur) * 100 : null,
      b: pointB !== null ? (pointB / dur) * 100 : null,
    };
  };

  return { element: root, getLoopPoints, clear };
}
function updateA(
  audioPlayer: AudioPlayerContainer,
  btnA: HTMLButtonElement,
  btnB: HTMLButtonElement,
  pointA: number | null,
  pointB: number | null
) {
  const state = audioPlayer.getState();
  if (state) {
    // Update A point with current playback time
    pointA = state.currentTime;

    // If A is after B, swap to maintain chronological order
    if (pointB !== null && pointA > pointB) {
      [pointA, pointB] = [pointB, pointA];
    }

    // Visual update - active style for A
    btnA.style.background = COLOR_A;
    btnA.style.color = "white";
    btnA.style.fontWeight = "800";
    btnA.style.boxShadow = `inset 0 0 0 2px ${COLOR_A}`;
    btnA.dataset.active = "true";

    // Preserve existing B marker if already set; otherwise keep B inactive
    if (pointB === null) {
      btnB.style.background = "transparent";
      btnB.style.color = "#495057";
      btnB.style.fontWeight = "600";
      btnB.style.boxShadow = "none";
      delete btnB.dataset.active;
    }

    // Re-render seek bar
    updateSeekBar();

    // Legacy: was used to move the piano-roll playhead immediately.
    // Component has been deprecated so we skip this step here.
  }
}

// -----------------------------------------------------------------
// NOTE: This legacy component is no longer wired into the player UI.
// We provide minimal stubs so the file still compiles without errors.
// -----------------------------------------------------------------

// Placeholder no-op so TypeScript finds a definition.
function updateSeekBar(): void {
  /* no-op - legacy UI component */
}
