import { COLOR_PRIMARY } from "@/lib/core/constants";
import { UIComponentDependencies } from "../types";
import { clamp } from "@/core/utils";

/**
 * Create a time display element.
 *
 * @param dependencies - The UI component dependencies.
 * @returns The time display element.
 */
export function createTimeDisplay(
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
      /* Only translate vertically so the handle is always fully visible even at 0% */
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      background: ${COLOR_PRIMARY};
      border-radius: 50%;
      cursor: pointer;
      left: 0%;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
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
  seekBarContainer.appendChild(progressBar);
  seekBarContainer.appendChild(seekHandle);

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
  };

  // Expose to external update loop
  dependencies.updateSeekBar = updateSeekBar;

  // Initial draw
  updateSeekBar();

  /** Click / seek interaction */
  const handleSeek = (evt: MouseEvent): void => {
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

  return container;
}
