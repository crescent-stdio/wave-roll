import { COLOR_PRIMARY } from "@/core/constants";
import { COLOR_A } from "@/core/constants";
import { COLOR_B } from "@/core/constants";
import { AudioPlayerControls } from "@/core/audio/audio-player";

/**
 * Create time display and seek bar
 *
 * @param audioPlayer - AudioPlayerControls instance
 * @returns HTMLElement containing time display and seek bar
 */
export function createTimeDisplay(
  audioPlayer: AudioPlayerControls
): HTMLElement {
  if (!audioPlayer) {
    throw new Error("AudioPlayerControls instance is required");
  }

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
  // box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

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

  // A-B loop region (behind progress bar)
  const loopRegion = document.createElement("div");
  loopRegion.id = "loop-region";
  loopRegion.style.cssText = `
    position: absolute;
    top: 0;
    height: 100%;
    /* High-contrast golden stripes for better visibility and harmony with vibrant colors */
    background: repeating-linear-gradient(
      -45deg,
      rgba(241, 196, 15, 0.5) 0px,
      rgba(241, 196, 15, 0.5) 4px,
      rgba(243, 156, 18, 0.3) 4px,
      rgba(243, 156, 18, 0.3) 8px
    );
    border-radius: 8px;
    display: none;
    border-top: 2px solid rgba(241, 196, 15, 0.9);
    border-bottom: 2px solid rgba(241, 196, 15, 0.9);
    box-sizing: border-box;
    pointer-events: none; /* let clicks pass through */
    position: relative;
    z-index: 3; /* ensure above progress bar */
    /* Add inner glow for better contrast against blue */
    box-shadow: inset 0 0 8px rgba(241, 196, 15, 0.3);
  `;

  // Progress bar
  const progressBar = document.createElement("div");
  progressBar.id = "progress-bar";
  progressBar.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: ${COLOR_PRIMARY};
    border-radius: 8px;
    width: 0%;
    transition: width 0.1s ease;
  `;

  // A marker with label
  const markerA = document.createElement("div");
  markerA.id = "marker-a";
  markerA.style.cssText = `
    position: absolute;
    top: -8px;
    width: 20px;
    height: 20px;
    display: none;
    z-index: 9;
    transform: translateX(-50%);
  `;
  markerA.innerHTML = `
    <div style="
      width: 20px;
      height: 20px;
      background: ${COLOR_A};
      border-radius: 4px 4px 0 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: bold;
      color: white;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      position: relative;
      z-index: 10;
    ">
      A
      <div style="
        position: absolute;
        bottom: -8px;
        left: 50%;
        transform: translateX(-50%);
        width: 2px;
        height: 8px;
        background: ${COLOR_A};
      "></div>
    </div>
  `;
  markerA.title = "Loop Start (A)";

  // ADD_START: time label for marker A
  {
    const labelATime = document.createElement("div");
    labelATime.style.cssText = `
      position: absolute;
      top: 22px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      font-weight: 600;
      color: ${COLOR_A};
      pointer-events: none;
    `;
    labelATime.textContent = "00:00";
    markerA.appendChild(labelATime);
    (audioPlayer as any).markerATimeLabel = labelATime;
  }
  // ADD_END

  // B marker with label
  const markerB = document.createElement("div");
  markerB.id = "marker-b";
  markerB.style.cssText = `
    position: absolute;
    top: -8px;
    width: 20px;
    height: 20px;
    display: none;
    z-index: 8;
    transform: translateX(-50%);
  `;
  markerB.innerHTML = `
    <div style="
      width: 20px;
      height: 20px;
      background: ${COLOR_B};
      border-radius: 4px 4px 4px 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: bold;
      color: white;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      position: relative;
      z-index: 7;
    ">
      B
      <div style="
        position: absolute;
        bottom: -8px;
        left: 50%;
        transform: translateX(-50%);
        width: 2px;
        height: 8px;
        background: ${COLOR_B};
        border-left: 2px dashed ${COLOR_B};
        width: 0;
      "></div>
    </div>
  `;
  // ADD_START: time label for marker B
  {
    const labelBTime = document.createElement("div");
    labelBTime.style.cssText = `
      position: absolute;
      top: 22px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
      font-weight: 600;
      color: ${COLOR_B};
      pointer-events: none;
    `;
    labelBTime.textContent = "00:00";
    markerB.appendChild(labelBTime);
    (audioPlayer as any).markerBTimeLabel = labelBTime;
  }
  // ADD_END
  markerB.title = "Loop End (B)";

  // Seek handle
  const seekHandle = document.createElement("div");
  seekHandle.style.cssText = `
    position: absolute;
    top: 50%;
    left: 0%;
    transform: translate(-50%, -50%);
    width: 16px;
    height: 16px;
    background: ${COLOR_PRIMARY};
    border: 3px solid white;
    border-radius: 8px;
    opacity: 0;
    transition: opacity 0.2s ease;
    `;
  // box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);

  // PROGRESS INDICATOR ▼ - always visible current position marker
  const progressIndicator = document.createElement("div");
  progressIndicator.style.cssText = `
    position: absolute;
    top: -14px;
    left: 0%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 14px solid ${COLOR_PRIMARY};
    pointer-events: none;
    transition: left 0.1s linear;
    z-index: 1; /* TODO: ensure above markers */
  `;
  (audioPlayer as any).progressIndicator = progressIndicator;

  seekBarContainer.appendChild(loopRegion);
  seekBarContainer.appendChild(progressBar);
  seekBarContainer.appendChild(markerA);
  seekBarContainer.appendChild(markerB);
  seekBarContainer.appendChild(seekHandle);
  seekBarContainer.appendChild(progressIndicator);

  // Store references for loop display
  (audioPlayer as any).seekBarContainer = seekBarContainer;
  (audioPlayer as any).loopRegion = loopRegion;
  (audioPlayer as any).markerA = markerA;
  (audioPlayer as any).markerB = markerB;

  // Show handle on hover
  seekBarContainer.addEventListener("mouseenter", () => {
    seekHandle.style.opacity = "1";
  });
  seekBarContainer.addEventListener("mouseleave", () => {
    if (!seeking) seekHandle.style.opacity = "0";
  });

  // Total time label
  const totalTimeLabel = document.createElement("span");
  totalTimeLabel.style.cssText = `
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
    font-size: 12px;
    font-weight: 500;
    color: #495057;
    min-width: 45px;
  `;
  totalTimeLabel.textContent = "00:00";

  let seeking = false;

  // Handle seeking
  const handleSeek = (e: MouseEvent) => {
    const rect = seekBarContainer.getBoundingClientRect();
    const percent = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width)
    );
    const state = audioPlayer?.getState();
    if (state) {
      const seekTime = percent * state.duration;
      audioPlayer?.seek(seekTime);
      progressBar.style.width = `${percent * 100}%`;
      seekHandle.style.left = `${percent * 100}%`;
      const progressIndicator = (audioPlayer as any).progressIndicator;
      if (progressIndicator) progressIndicator.style.left = `${percent * 100}%`;
    }
  };

  seekBarContainer.addEventListener("mousedown", (e) => {
    seeking = true;
    seekHandle.style.opacity = "1";
    handleSeek(e);

    const handleMove = (e: MouseEvent) => {
      if (seeking) handleSeek(e);
    };

    const handleUp = () => {
      seeking = false;
      seekHandle.style.opacity = "0";
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  });

  // Store references for updates
  audioPlayer.progressBar = progressBar;
  audioPlayer.seekHandle = seekHandle;
  audioPlayer.seeking = () => seeking;

  container.appendChild(currentTimeLabel);
  container.appendChild(seekBarContainer);
  container.appendChild(totalTimeLabel);

  // Expose for update loop
  audioPlayer.currentTimeLabel = currentTimeLabel;
  audioPlayer.totalTimeLabel = totalTimeLabel;

  return container;
}
