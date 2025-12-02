import { COLOR_PRIMARY, COLOR_A, COLOR_B } from "@/lib/core/constants";
import { UIComponentDependencies } from "../types";
import { clamp } from "@/core/utils";
import { updateLoopDisplay } from "@/lib/components/player/wave-roll/ui/loop-display";
import { createMarker } from "../../player/wave-roll/ui/marker";

/**
 * Create a time display element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The time display element.
 */
export function createTimeDisplayUI(
  dependencies: UIComponentDependencies
): HTMLElement {
  const container = document.createElement("div");
  container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--surface);
      color: var(--text-primary);
      padding: 14px 14px 10px 14px;
      border-radius: 8px;
      margin-top: 4px;
      box-shadow: var(--shadow-sm);
    `;

  // Current time label
  const currentTimeLabel = document.createElement("span");
  currentTimeLabel.style.cssText = `
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      min-width: 45px;
      text-align: right;
    `;
  currentTimeLabel.textContent = "00:00";

  // Seek bar container
  const seekBarContainer = document.createElement("div");
  seekBarContainer.style.cssText = `
      flex: 1;
      position: relative;
      height: 6px;
      background: var(--track-bg);
      border-radius: 8px;
      cursor: pointer;
    `;

  /* -------------------------------------------------------------
   *  Loop overlay (striped region) + markers (A/B)
   * ----------------------------------------------------------- */
  // Striped loop region
  const loopRegion = document.createElement("div");
  loopRegion.style.cssText = `
      position: absolute;
      top: 0;
      height: 100%;
      background: repeating-linear-gradient(
        -45deg,
        var(--loop-stripe-a) 0px,
        var(--loop-stripe-a) 4px,
        var(--loop-stripe-b) 4px,
        var(--loop-stripe-b) 8px
      );
      border-top: 2px solid var(--loop-stripe-border);
      border-bottom: 2px solid var(--loop-stripe-border);
      border-left: 2px solid var(--loop-stripe-border);
      border-right: 2px solid var(--loop-stripe-border);
      display: none;
      pointer-events: none;
      z-index: 1;
      border-radius: 8px;
    `;
  seekBarContainer.appendChild(loopRegion);

  /* -----------------------------------------------------------
   * Re-use global .wr-marker style (injected once)
   * --------------------------------------------------------- */
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
      /* stem is now created as a real DOM element (.wr-marker-stem) in marker.ts */
    `;
    document.head.appendChild(style);
  }

  const _deprecatedCreateMarker = (
    label: string,
    color: string,
    id: string
  ) => {
    const el = document.createElement("div");
    el.id = id;
    el.className = "wr-marker";
    el.style.background = color;
    el.style.color = color; // stem color via currentColor
    el.style.display = "none"; // Initially hidden until loop points are set

    const span = document.createElement("span");
    span.textContent = label;
    span.style.color = "#ffffff";
    el.appendChild(span);

    return el;
  };

  const markerA = createMarker("A", COLOR_A, "wr-seekbar-marker-a", 14);
  const markerB = createMarker("B", COLOR_B, "wr-seekbar-marker-b", 14);

  // Enable click interaction for markers to allow ad-hoc debugging
  // without affecting seek/drag (stop propagation to avoid seeking).
  markerA.style.pointerEvents = "auto";
  markerB.style.pointerEvents = "auto";

  const logMarkerClick = (label: "A" | "B", el: HTMLElement) => (evt: MouseEvent) => {
    evt.stopPropagation();
    // Prefer the current loopPoints percent; fallback to style.left.
    const pct = (() => {
      const lp = dependencies.loopPoints as { a: number | null; b: number | null } | null;
      const v = label === "A" ? lp?.a : lp?.b;
      if (typeof v === "number") return v;
      const left = (el.style.left || "0%").replace("%", "");
      const n = Number(left);
      return Number.isFinite(n) ? n : 0;
    })();
    const duration = Math.max(lastEffectiveDuration || 0, 0);
    const sec = duration > 0 ? (pct / 100) * duration : 0;
    // eslint-disable-next-line no-console
    // console.log(`[Loop Marker] ${label} clicked`, { percent: pct, timeSec: sec.toFixed(3) });
  };

  markerA.addEventListener("click", logMarkerClick("A", markerA));
  markerB.addEventListener("click", logMarkerClick("B", markerB));

  // Progress bar
  const progressBar = document.createElement("div");
  progressBar.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, var(--accent-strong), var(--accent));
      border-radius: 8px;
      width: 0%;
    `;

  // Seek handle
  const seekHandle = document.createElement("div");
  seekHandle.style.cssText = `
      position: absolute;
      top: 50%;
      /* Center the handle both horizontally and vertically so the midpoint
         aligns with the progress bar edge. */
      transform: translate(-50%, -50%);
      width: 16px;
      height: 16px;
      background: var(--accent-strong);
      border-radius: 50%;
      cursor: pointer;
      left: 0%;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      z-index: 4;
    `;

  // Total time label
  const totalTimeLabel = document.createElement("span");
  totalTimeLabel.style.cssText = `
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      min-width: 45px;
    `;
  totalTimeLabel.textContent = "00:00";

  // Assemble seek bar
  // Maintain correct stacking order: progress (0) -> loopRegion (1) -> handle (>1) -> markers (3)
  seekBarContainer.appendChild(progressBar);
  seekBarContainer.appendChild(loopRegion);
  seekBarContainer.appendChild(seekHandle);
  // Markers on top-most layer
  seekBarContainer.appendChild(markerA);
  seekBarContainer.appendChild(markerB);

  // Assemble container
  container.appendChild(currentTimeLabel);
  container.appendChild(seekBarContainer);
  container.appendChild(totalTimeLabel);

  /**
   * ---- Seek-bar logic ----
   */
  // Cache for last valid non-zero currentTime
  let lastValidCurrentTime = 0;
  // Cache for last known effective duration (tempo/WAV-aware)
  let lastEffectiveDuration = 0;

  const localUpdateSeekBar = (override?: {
    currentTime: number;
    duration: number;
  }): void => {
    const state = override ?? dependencies.audioPlayer?.getState();

    // Enhanced debugging to track the source of updates
    const updateSource = override ? "override" : "audioPlayer";
    const stackTrace = new Error().stack?.split("\n")[2]?.trim() || "unknown";

    // Only log significant changes to reduce console noise
    const shouldLog =
      Math.abs((state?.currentTime || 0) - lastValidCurrentTime) > 0.1 ||
      state?.currentTime === 0;

    if (shouldLog) {
      // // console.log(
      //   "[SeekBar.updateSeekBar]",
      //   state?.currentTime,
      //   state?.duration,
      //   {
      //     ...state,
      //     updateSource,
      //     caller: stackTrace,
      //     lastValidCurrentTime,
      //   }
      // );
    }
    // // console.log(
    //   "[SeekBar] current:",
    //   state?.currentTime,
    //   "dur:",
    //   state?.duration
    // );

    // Remove debug logging
    // // console.log("[updateSeekBar] called", {
    //   hasOverride: !!override,
    //   state,
    //   audioPlayerExists: !!dependencies.audioPlayer,
    // });

    if (!state) {
      // No state available; skip until next tick
      return;
    }

    // Detect and ignore sudden drops to 0 when playback is active
    if (state.currentTime === 0 && lastValidCurrentTime > 0.1) {
      // If we had a valid non-zero time and suddenly get 0, ignore it
      // unless it's a genuine seek to start
      // Check if we're playing (either from override or from audio player state)
      const isPlaying = override
        ? false
        : dependencies.audioPlayer?.getState()?.isPlaying;
      if (isPlaying) {
        // // console.log(
        //   "[SeekBar.updateSeekBar] Ignoring sudden drop to 0, keeping",
        //   lastValidCurrentTime
        // );
        // Use the last valid time instead
        state.currentTime = lastValidCurrentTime;
      }
    }

    // Update cache if we have a valid time
    if (state.currentTime > 0) {
      lastValidCurrentTime = state.currentTime;
    }

    // Update time labels even if duration is 0
    currentTimeLabel.textContent = dependencies.formatTime(state.currentTime);
    
    // Use provided override duration (already tempo/WAV-aware) when available
    if (override) {
      lastEffectiveDuration = Math.max(0, override.duration || 0);
      totalTimeLabel.textContent = dependencies.formatTime(lastEffectiveDuration);
    } else {
      // Fallback: derive from audio player duration, scaled by playbackRate
      const rate = dependencies.audioPlayer?.getState().playbackRate ?? 100;
      const rawDur = state.duration || 0;
      const adjustedDuration = rawDur * (100 / rate);
      lastEffectiveDuration = adjustedDuration;
      totalTimeLabel.textContent = dependencies.formatTime(adjustedDuration);
    }

    if ((override ? override.duration : state.duration) === 0) {
      // Set progress to 0 when duration is 0
      progressBar.style.width = "0%";
      seekHandle.style.left = "0%";
      return;
    }

    // Debug percent and currentTime (first few only)
    // Remove debug logging
    // if (dbgCounters.normal < 5) {
    //   const dbgPercent = (state.currentTime / state.duration) * 100;
    //   // console.log("[updateSeekBar] updating", {
    //     currentTime: state.currentTime,
    //     duration: state.duration,
    //     percent: dbgPercent,
    //   });
    //   dbgCounters.normal++;
    // }

    const denom = override ? Math.max(override.duration, 0.000001) : Math.max(lastEffectiveDuration || state.duration, 0.000001);
    // Clamp current time to [0, denom] to prevent overflow beyond the end
    const clampedCurrent = Math.min(Math.max(state.currentTime, 0), denom);
    const percent = Math.min(Math.max((clampedCurrent / denom) * 100, 0), 100);
    // Only log percent changes for debugging
    if (shouldLog) {
      // // console.log(
      //   "%c[SeekBar.updateSeekBar] percent:",
      //   "color: red; font-weight: bold;",
      //   percent
      // );
    }
    progressBar.style.width = `${percent}%`;
    // Prevent the handle from being positioned slightly outside the bar when
    // the progress is extremely small (e.g., < 0.5%).
    const safePercent = Math.max(percent, 0);
    seekHandle.style.left = `${Math.min(safePercent, 100)}%`;

    /* ---------------------------------------------------------
     *   Loop overlay & markers
     * ------------------------------------------------------- */
    // Only show loop markers if we have a valid duration (i.e., files are loaded)
    // Map dependency format (a/b in seconds or percent) to percent units.
    // Here, dependencies.loopPoints follows { a:?, b:? } where the values are
    // percentages [0-100] (this is what loop-controls dispatches). Therefore
    // we can forward directly.
    // Show loop markers when we have a positive effective duration (override wins)
    const effectiveForOverlay = override ? override.duration : (lastEffectiveDuration || state.duration || 0);
    const shouldShowLoopMarkers = effectiveForOverlay > 0;
    updateLoopDisplay({
      loopPoints: shouldShowLoopMarkers ? (dependencies.loopPoints ?? null) : null,
      loopRegion,
      markerA,
      markerB,
    });
  };

  // Expose to external update loop
  dependencies.updateSeekBar = localUpdateSeekBar;

  // Initial draw
  localUpdateSeekBar();

  /** Click / seek interaction */
  // Flag to distinguish a simple click from a drag (pointermove).
  let dragOccurred = false;

  const handleSeek = (evt: MouseEvent): void => {
    // Ignore the synthetic click that fires right after a drag-release.
    if (dragOccurred) {
      dragOccurred = false;
      return;
    }

    const rect = seekBarContainer.getBoundingClientRect();
    const percent = (evt.clientX - rect.left) / rect.width;
    const state = dependencies.audioPlayer?.getState();
    const duration = lastEffectiveDuration || state?.duration || 0;
    if (!state || duration === 0) {
      return;
    }

    const newTime = clamp(duration * percent, 0, duration);
    dependencies.audioPlayer?.seek(newTime, true);
    localUpdateSeekBar();
  };

  seekBarContainer.addEventListener("click", handleSeek);

  /**
   * ---- Drag interaction (pointer events) ----
   * Allows real-time scrubbing by dragging the seek handle or anywhere on the bar.
   */
  let isDragging = false;
  // Stores last time (sec) hovered while dragging so we can commit once.
  let pendingSeekTime: number | null = null;

  const handlePointerMove = (evt: PointerEvent): void => {
    if (!isDragging) return;

    // Mark that a drag (actual movement) has occurred so the upcoming click
    // event (which fires after pointerup) can be suppressed.
    dragOccurred = true;

    const rect = seekBarContainer.getBoundingClientRect();
    const percent = clamp((evt.clientX - rect.left) / rect.width, 0, 1);

    const state = dependencies.audioPlayer?.getState();
    const duration = lastEffectiveDuration || state?.duration || 0;
    const newTime = duration * percent;

    // Cache the target time so we can apply it once on pointerup.
    pendingSeekTime = newTime;

    // Immediate visual feedback while dragging - no engine seek yet.
    localUpdateSeekBar({ currentTime: newTime, duration });
  };

  const endDrag = (): void => {
    if (!isDragging) return;
    isDragging = false;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", endDrag);

    // Commit the seek only once after drag completes to avoid audio glitches.
    if (pendingSeekTime !== null) {
      dependencies.audioPlayer?.seek(pendingSeekTime, true);
      pendingSeekTime = null;
    }
  };

  const startDrag = (evt: PointerEvent): void => {
    isDragging = true;
    // Perform first visual update immediately
    handlePointerMove(evt);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag, { once: true });
  };

  // Enable dragging from both the handle and the bar itself
  seekHandle.addEventListener("pointerdown", startDrag);
  seekBarContainer.addEventListener("pointerdown", startDrag);

  return container;
}
