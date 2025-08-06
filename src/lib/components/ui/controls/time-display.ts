import { COLOR_PRIMARY, COLOR_A, COLOR_B } from "@/lib/core/constants";
import { UIComponentDependencies } from "../types";
import { clamp } from "@/core/utils";
import { updateLoopDisplay } from "@/lib/components/player/wave-roll/ui/loop-display";

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
      background: white;
      padding: 14px 14px 10px 14px;
      border-radius: 8px;
      margin-top: 4px;
    `;

  // Current time label
  const currentTimeLabel = document.createElement("span");
  currentTimeLabel.style.cssText = `
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      font-size: 12px;
      font-weight: 500;
      color: #495057;
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
      background: #e9ecef;
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
        rgba(241, 196, 15, 0.6) 0px,
        rgba(241, 196, 15, 0.6) 4px,
        rgba(243, 156, 18, 0.4) 4px,
        rgba(243, 156, 18, 0.4) 8px
      );
      border-top: 2px solid rgba(241, 196, 15, 0.9);
      border-bottom: 2px solid rgba(241, 196, 15, 0.9);
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
      .wr-marker::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        width: 2px;
        height: 14px;
        background: currentColor;
      }
    `;
    document.head.appendChild(style);
  }

  const createMarker = (label: string, color: string, id: string) => {
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

  const markerA = createMarker("A", COLOR_A, "wr-seekbar-marker-a");
  const markerB = createMarker("B", COLOR_B, "wr-seekbar-marker-b");

  // Progress bar
  const progressBar = document.createElement("div");
  progressBar.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, ${COLOR_PRIMARY}, #4dabf7);
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
      background: ${COLOR_PRIMARY};
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
      color: #6c757d;
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

  const updateSeekBar = (override?: {
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

    const dbgCounters = (updateSeekBar as any)._dbg ?? {
      noState: 0,
      zeroDur: 0,
      normal: 0,
    };
    (updateSeekBar as any)._dbg = dbgCounters;

    if (!state) {
      if (dbgCounters.noState < 5) {
        console.warn("[UIControlFactory.updateSeekBar] no state");
        dbgCounters.noState++;
      }
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
    totalTimeLabel.textContent = dependencies.formatTime(state.duration);

    if (state.duration === 0) {
      if (dbgCounters.zeroDur < 5) {
        // console.warn("[UIControlFactory.updateSeekBar] duration 0", state);
        dbgCounters.zeroDur++;
      }
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

    const percent = (state.currentTime / state.duration) * 100;
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
    seekHandle.style.left = `${safePercent}%`;

    /* ---------------------------------------------------------
     *   Loop overlay & markers
     * ------------------------------------------------------- */
    // Only show loop markers if we have a valid duration (i.e., files are loaded)
    // Map dependency format (a/b in seconds or percent) to percent units.
    // Here, dependencies.loopPoints follows { a:?, b:? } where the values are
    // percentages [0-100] (this is what loop-controls dispatches). Therefore
    // we can forward directly.
    const shouldShowLoopMarkers = state.duration > 0;
    updateLoopDisplay({
      loopPoints: shouldShowLoopMarkers ? (dependencies.loopPoints ?? null) as any : null,
      loopRegion,
      markerA,
      markerB,
    });
  };

  // Expose to external update loop
  dependencies.updateSeekBar = updateSeekBar;

  // Initial draw
  updateSeekBar();

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
    if (!state || state.duration === 0) {
      return;
    }

    const newTime = clamp(state.duration * percent, 0, state.duration);
    dependencies.audioPlayer?.seek(newTime, true);
    updateSeekBar();
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
    const duration = state?.duration ?? 0;
    const newTime = duration * percent;

    // Cache the target time so we can apply it once on pointerup.
    pendingSeekTime = newTime;

    // Immediate visual feedback while dragging - no engine seek yet.
    updateSeekBar({ currentTime: newTime, duration });
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
