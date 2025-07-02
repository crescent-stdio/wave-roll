/**
 * Player Demo - Integration example for AudioPlayer + PianoRoll
 *
 * Demonstrates how to create and control a synchronized audio player
 * with PixiJS piano roll visualization.
 */

import { NoteData } from "./types";
import { createPianoRoll, PianoRollOptions } from "./piano-roll";
import {
  createAudioPlayer,
  AudioPlayerControls,
  PlayerOptions,
} from "./AudioPlayer";
import { PLAYER_ICONS } from "./icons";

/**
 * Color-blind-safe palette with high saturation and brightness contrast
 *  - COLOR_PRIMARY: vibrant blue for progress/controls (#0984e3) - HSL(204°, 78%, 47%)
 *  - COLOR_A: teal marker A (#00b894) - HSL(168°, 100%, 36%) - distinguishable for deuteranopia
 *  - COLOR_B: vibrant red-orange marker B (#e74c3c) - HSL(6°, 78%, 57%) - high brightness contrast
 */
const COLOR_PRIMARY = "#0984e3"; // Vibrant blue with high saturation
const COLOR_A = "#00b894"; // Teal (better than green for color-blind users)
const COLOR_B = "#e74c3c"; // Vibrant red-orange (high brightness contrast)

/**
 * Demo configuration options
 */
export interface PlayerDemoOptions {
  /** Piano roll options */
  pianoRoll?: PianoRollOptions;
  /** Audio player options */
  player?: PlayerOptions;
  /** Show time display */
  showTimeDisplay?: boolean;
  /** Show volume control */
  showVolumeControl?: boolean;
  /** Show tempo control */
  showTempoControl?: boolean;
  /** Color theme */
  theme?: "light" | "dark";
}

/**
 * Complete audio player + piano roll demo
 */
export class PlayerDemo {
  private container: HTMLElement;
  private notes: NoteData[];
  private options: PlayerDemoOptions;

  private pianoRollInstance: any = null;
  private audioPlayer: AudioPlayerControls | null = null;

  private controlsContainer: HTMLElement;
  private timeDisplay: HTMLElement;
  private isInitialized = false;

  constructor(
    container: HTMLElement,
    notes: NoteData[],
    options: PlayerDemoOptions = {}
  ) {
    this.container = container;
    this.notes = notes;
    this.options = {
      showTimeDisplay: true,
      showVolumeControl: true,
      showTempoControl: true,
      ...options,
    };

    this.controlsContainer = document.createElement("div");
    this.timeDisplay = document.createElement("div");
  }

  /**
   * Initialize the demo with piano roll and audio player
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Create piano roll container
      const pianoRollContainer = document.createElement("div");
      pianoRollContainer.style.cssText = `
        width: 100%;
        height: 400px;
        border: 1px solid #ddd;
        border-radius: 8px;
        margin-bottom: 20px;
        background: #ffffff;
      `;

      // Create piano roll
      this.pianoRollInstance = await createPianoRoll(
        pianoRollContainer,
        this.notes,
        {
          width: 800,
          height: 380,
          backgroundColor: 0xffffff,
          noteColor: 0x4285f4,
          playheadColor: 0xff4444,
          showPianoKeys: true,
          noteRange: { min: 21, max: 108 },
          ...this.options.pianoRoll,
        }
      );

      // Create audio player
      this.audioPlayer = createAudioPlayer(this.notes, this.pianoRollInstance, {
        tempo: 120,
        volume: 0.7,
        repeat: false,
        ...this.options.player,
      });

      // Set up UI
      this.setupUI();

      // Add elements to container
      this.container.innerHTML = "";
      this.container.appendChild(pianoRollContainer);
      this.container.appendChild(this.controlsContainer);

      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize player demo:", error);
      throw error;
    }
  }

  /**
   * Set up the control UI
   */
  private setupUI(): void {
    this.controlsContainer.innerHTML = "";
    this.controlsContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: #f8f9fa;
      padding: 12px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      `;

    // First row: All controls
    const controlsRow = document.createElement("div");
    controlsRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 20px;
      justify-content: flex-start;
      flex-wrap: wrap;
    `;

    // Group 1: Playback controls
    const playbackControls = this.createPlaybackControls();
    controlsRow.appendChild(playbackControls);

    // Group 2: A-B Loop controls
    const loopControls = this.createLoopControls();
    controlsRow.appendChild(loopControls);

    // Group 3: Volume Control
    const volumeControl = this.createVolumeControl();
    controlsRow.appendChild(volumeControl);

    // Group 4: Tempo Control
    const tempoControl = this.createTempoControl();
    controlsRow.appendChild(tempoControl);

    // Group 5: Zoom Reset Control
    const zoomResetControl = this.createZoomControls();
    controlsRow.appendChild(zoomResetControl);

    // Group 6: Settings Control
    const settingsControl = this.createSettingsControl();
    controlsRow.appendChild(settingsControl);

    // Add to container
    this.controlsContainer.appendChild(controlsRow);

    // Second row: Time display and seek bar
    if (this.options.showTimeDisplay) {
      const timeDisplay = this.createTimeDisplay();
      this.controlsContainer.appendChild(timeDisplay);
    }

    // Start update loop for time display
    this.startUpdateLoop();
  }

  /**
   * Create main playback control buttons
   */
  private createPlaybackControls(): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      gap: 4px;
      align-items: center;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px;
      border-radius: 8px;
      position: relative;
      z-index: 10; /* ensure above any overlay from seek bar */
    `;

    // Play/Pause button - Primary action, larger
    const playBtn = document.createElement("button");
    playBtn.innerHTML = PLAYER_ICONS.play;
    playBtn.style.cssText = `
      width: 40px;
      height: 40px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: ${COLOR_PRIMARY};
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      position: relative;
    `;

    // Function to update play button state and behavior
    const updatePlayButton = () => {
      const state = this.audioPlayer?.getState();
      if (state?.isPlaying) {
        playBtn.innerHTML = PLAYER_ICONS.pause;
        playBtn.style.background = "#28a745";
        playBtn.onclick = () => {
          this.audioPlayer?.pause();
          updatePlayButton();
        };
      } else {
        playBtn.innerHTML = PLAYER_ICONS.play;
        playBtn.style.background = COLOR_PRIMARY;
        playBtn.onclick = async () => {
          try {
            await this.audioPlayer?.play();
            updatePlayButton();
          } catch (error) {
            console.error("Failed to play:", error);
            alert(
              `Failed to start playback: ${error instanceof Error ? error.message : "Unknown error"}`
            );
          }
        };
      }
    };

    // Play button hover effects
    playBtn.addEventListener("mouseenter", () => {
      playBtn.style.transform = "scale(1.05)";
    });
    playBtn.addEventListener("mouseleave", () => {
      playBtn.style.transform = "scale(1)";
    });
    playBtn.addEventListener("mousedown", () => {
      playBtn.style.transform = "scale(0.95)";
    });
    playBtn.addEventListener("mouseup", () => {
      playBtn.style.transform = "scale(1.05)";
    });

    // Set initial state
    updatePlayButton();

    // Secondary buttons with flat design
    const createSecondaryButton = (
      icon: string,
      onClick: () => void
    ): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.innerHTML = icon;
      btn.onclick = onClick;
      btn.style.cssText = `
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

      btn.addEventListener("mouseenter", () => {
        btn.style.background = "rgba(0, 0, 0, 0.05)";
      });
      btn.addEventListener("mouseleave", () => {
        if (!btn.dataset.active) {
          btn.style.background = "transparent";
        }
      });

      return btn;
    };

    // Restart button
    const restartBtn = createSecondaryButton(PLAYER_ICONS.restart, () => {
      this.audioPlayer?.restart();
      updatePlayButton();
    });

    // Repeat toggle
    const repeatBtn = createSecondaryButton(PLAYER_ICONS.repeat, () => {
      const state = this.audioPlayer?.getState();
      const newRepeat = !state?.isRepeating;
      this.audioPlayer?.toggleRepeat(newRepeat);

      if (newRepeat) {
        repeatBtn.dataset.active = "true";
        repeatBtn.style.background = "rgba(0, 123, 255, 0.1)";
        repeatBtn.style.color = COLOR_PRIMARY;
      } else {
        delete repeatBtn.dataset.active;
        repeatBtn.style.background = "transparent";
        repeatBtn.style.color = "#495057";
      }
    });

    container.appendChild(restartBtn);
    container.appendChild(playBtn);
    container.appendChild(repeatBtn);

    // Store updatePlayButton for use in update loop
    (this as any).updatePlayButton = updatePlayButton;

    return container;
  }

  /**
   * Create A-B loop controls
   */
  private createLoopControls(): HTMLElement {
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
        if (!isActive) {
          btn.style.background = "rgba(0, 0, 0, 0.05)";
        }
      });
      btn.addEventListener("mouseleave", () => {
        if (!isActive) {
          btn.style.background = "transparent";
        }
      });

      return btn;
    };

    // A button
    const btnA = createLoopButton(
      "A",
      () => {
        const state = this.audioPlayer?.getState();
        if (state) {
          // Update A point with current playback time
          pointA = state.currentTime;

          // If A is after B, swap to maintain chronological order
          if (pointB !== null && pointA > pointB) {
            [pointA, pointB] = [pointB, pointA];
          }

          // Visual update – active style for A
          btnA.style.background = COLOR_A;
          btnA.style.color = "white";
          btnA.style.fontWeight = "800";
          btnA.style.boxShadow = `inset 0 0 0 2px ${COLOR_A}`;

          // Reset B since we only have one point defined
          pointB = null;
          btnB.style.background = "transparent";
          btnB.style.color = "#495057";
          btnB.style.fontWeight = "600";
          btnB.style.boxShadow = "none";

          // Re-render seek bar
          updateSeekBar();
        }
      },
      true
    ); // Active by default with virtual point
    btnA.style.background = COLOR_A;
    btnA.style.color = "white";
    btnA.style.fontWeight = "800";

    // B button
    const btnB = createLoopButton(
      "B",
      () => {
        const state = this.audioPlayer?.getState();
        if (state) {
          // If A is not yet set, treat this click as setting A first (requirement 3)
          if (pointA === null) {
            pointA = state.currentTime;

            // Visual style for what is now the A marker
            btnA.style.background = COLOR_A;
            btnA.style.color = "white";
            btnA.style.fontWeight = "800";
            btnA.style.boxShadow = `inset 0 0 0 2px ${COLOR_A}`;

            // Reset B since we only have one point defined
            pointB = null;
            btnB.style.background = "transparent";
            btnB.style.color = "#495057";
            btnB.style.fontWeight = "600";
            btnB.style.boxShadow = "none";
          } else {
            // Normal behaviour – set B point
            pointB = state.currentTime;

            // Ensure chronological order A < B (requirement 4)
            if (pointB < pointA) {
              [pointA, pointB] = [pointB, pointA];
            }

            // Active style for B
            btnB.style.background = `${COLOR_B}`;
            btnB.style.color = "white";
            btnB.style.fontWeight = "800";
            btnB.style.boxShadow = "inset 0 0 0 2px #ff7f00";
          }

          // Re-render seek bar
          updateSeekBar();
        }
      },
      true
    ); // Active by default with virtual point
    btnB.style.background = `${COLOR_B}`;
    btnB.style.color = "white";
    btnB.style.fontWeight = "800";

    // Clear button
    const btnClear = createLoopButton("✕", () => {
      pointA = null;
      pointB = null;
      isLooping = false;
      btnA.style.background = "transparent";
      btnA.style.color = "#495057";
      btnA.style.fontWeight = "600";
      btnA.style.boxShadow = "none";
      btnB.style.background = "transparent";
      btnB.style.color = "#495057";
      btnB.style.fontWeight = "600";
      btnB.style.boxShadow = "none";
      updateSeekBar();
    });
    btnClear.style.fontSize = "16px";
    btnClear.title = "Clear A-B Loop";

    // Update seek bar to show A-B region
    const updateSeekBar = () => {
      const progressBar = (this as any).progressBar;
      const seekBarContainer = (this as any).seekBarContainer;
      if (progressBar && seekBarContainer) {
        const state = this.audioPlayer?.getState();
        if (state && state.duration > 0 && pointA !== null) {
          // Always compute A percent if pointA is defined
          let start = pointA;
          let end: number | null = pointB;

          // Maintain chronological order if both points exist
          if (end !== null && start > end) {
            [start, end] = [end, start];
            pointA = start;
            pointB = end;
          }

          const aPercent = (start / state.duration) * 100;
          const bPercent = end !== null ? (end / state.duration) * 100 : null;
          // Store loop points for seek bar rendering (b can be null)
          (this as any).loopPoints = { a: aPercent, b: bPercent };
          return;
        }
      }
      // No valid loop data – reset
      (this as any).loopPoints = null;
    };

    // Store references
    (this as any).updateSeekBar = updateSeekBar;

    container.appendChild(btnA);
    container.appendChild(btnB);
    container.appendChild(btnClear);

    // Initialize with virtual points
    setTimeout(() => {
      updateSeekBar();
      // Trigger initial display
      const updateSeekBarFunc = (this as any).updateSeekBar;
      if (updateSeekBarFunc) {
        updateSeekBarFunc();
      }
    }, 100); // Small delay to ensure seek bar is initialized

    return container;
  }

  /**
   * Create time display and seek bar
   */
  private createTimeDisplay(): HTMLElement {
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

    // PROGRESS INDICATOR ▼ – always visible current position marker
    const progressIndicator = document.createElement("div");
    progressIndicator.style.cssText = `
      position: absolute;
      top: -10px;
      left: 0%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 14px solid ${COLOR_PRIMARY};
      pointer-events: none;
      transition: left 0.1s linear;
      z-index: 1;
    `;
    (this as any).progressIndicator = progressIndicator;

    seekBarContainer.appendChild(loopRegion);
    seekBarContainer.appendChild(progressBar);
    seekBarContainer.appendChild(markerA);
    seekBarContainer.appendChild(markerB);
    seekBarContainer.appendChild(seekHandle);
    seekBarContainer.appendChild(progressIndicator);

    // Store references for loop display
    (this as any).seekBarContainer = seekBarContainer;
    (this as any).loopRegion = loopRegion;
    (this as any).markerA = markerA;
    (this as any).markerB = markerB;

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
      const state = this.audioPlayer?.getState();
      if (state) {
        const seekTime = percent * state.duration;
        this.audioPlayer?.seek(seekTime);
        progressBar.style.width = `${percent * 100}%`;
        seekHandle.style.left = `${percent * 100}%`;
        const progressIndicator = (this as any).progressIndicator;
        if (progressIndicator)
          progressIndicator.style.left = `${percent * 100}%`;
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
    (this as any).progressBar = progressBar;
    (this as any).seekHandle = seekHandle;
    (this as any).seeking = () => seeking;

    container.appendChild(currentTimeLabel);
    container.appendChild(seekBarContainer);
    container.appendChild(totalTimeLabel);

    // Expose for update loop
    (this as any).currentTimeLabel = currentTimeLabel;
    (this as any).totalTimeLabel = totalTimeLabel;

    return container;
  }

  /**
   * Create volume control slider
   */
  private createVolumeControl(): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 12px;
      border-radius: 8px;
      `;
    // box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);

    // Volume icon button (clickable for mute)
    const iconBtn = document.createElement("button");
    iconBtn.innerHTML = PLAYER_ICONS.volume;
    iconBtn.style.cssText = `
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      background: none;
      color: #495057;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s ease;
    `;

    let previousVolume = 0.7;
    let isMuted = false;

    // Slider (0-100 %)
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = "70";
    slider.style.cssText = `
      width: 70px;
      -webkit-appearance: none;
      appearance: none;
      height: 4px;
      background: #e9ecef;
      border-radius: 8px;
      outline: none;
      cursor: pointer;
    `;

    // Numeric input (0-100 %)
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "100";
    input.value = "70";
    input.step = "1";
    input.style.cssText = `
      width: 52px;
      padding: 4px 6px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      color: #007bff;
      background: rgba(0, 123, 255, 0.08);
      outline: none;
      text-align: center;
      /* Preserve native spin buttons */
    `;

    // Custom slider styling
    const sliderStyleId = "volume-slider-style";
    if (!document.getElementById(sliderStyleId)) {
      const sliderStyle = document.createElement("style");
      sliderStyle.id = sliderStyleId;
      sliderStyle.textContent = `
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          background: ${COLOR_PRIMARY};
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: ${COLOR_PRIMARY};
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        input[type="range"]:hover::-webkit-slider-thumb {
          transform: scale(1.2);
        }
        input[type="range"]:hover::-moz-range-thumb {
          transform: scale(1.2);
        }
      `;
      document.head.appendChild(sliderStyle);
    }

    const clampPercent = (v: number) => Math.max(0, Math.min(100, v));

    const updateUI = (percent: number) => {
      const safe = clampPercent(percent);
      slider.value = safe.toString();
      input.value = safe.toString();

      // Update icon color
      if (safe === 0) {
        iconBtn.style.color = "#dc3545"; // red for mute
      } else if (safe < 30) {
        iconBtn.style.color = "#ffc107"; // yellow for low volume
      } else {
        iconBtn.style.color = "#495057"; // default
      }
    };

    const updateVolume = (percent: number) => {
      const vol = clampPercent(percent) / 100;
      this.audioPlayer?.setVolume(vol);

      // Remember this as previousVolume if non-zero (for mute toggle)
      if (vol > 0) {
        previousVolume = vol;
      }

      updateUI(percent);
    };

    // Icon click → mute/unmute
    iconBtn.addEventListener("click", () => {
      if (isMuted) {
        updateVolume(previousVolume * 100);
        isMuted = false;
      } else {
        updateVolume(0);
        isMuted = true;
      }
    });

    // Slider change
    slider.addEventListener("input", () => {
      isMuted = false;
      updateVolume(parseFloat(slider.value));
    });

    // Numeric input change / blur
    const handleInputChange = () => {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        isMuted = false;
        updateVolume(val);
      }
    };
    input.addEventListener("input", handleInputChange);
    input.addEventListener("blur", handleInputChange);

    // Wheel scroll (hover)
    container.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      const newVal = clampPercent(parseFloat(slider.value) + delta);
      isMuted = false;
      updateVolume(newVal);
    });

    // Global keyboard shortcuts: ArrowUp/Down (±1) , Shift+Arrow (±5) , M for mute
    if (!(window as any)._volumeKeyHandlerAttached) {
      (window as any)._volumeKeyHandlerAttached = true;
      window.addEventListener("keydown", (e) => {
        // Ignore if focusing on a form element except our numeric input
        if (
          ["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName) &&
          e.target !== input
        ) {
          return;
        }

        if (e.key.toLowerCase() === "m") {
          iconBtn.click();
          return;
        }

        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          const step = e.shiftKey ? 5 : 1;
          const dir = e.key === "ArrowUp" ? 1 : -1;
          const newVal = clampPercent(parseFloat(slider.value) + dir * step);
          isMuted = false;
          updateVolume(newVal);
        }
      });
    }

    // Initial sync
    updateVolume(70);

    container.appendChild(iconBtn);
    container.appendChild(slider);
    container.appendChild(input);

    return container;
  }

  /**
   * Create tempo control with number input
   */
  private createTempoControl(): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px 12px;
      border-radius: 8px;
      `;
    // box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);

    // Tempo icon
    // const icon = document.createElement("div");
    // icon.innerHTML = PLAYER_ICONS.tempo;
    // icon.style.cssText = `
    //   width: 16px;
    //   height: 16px;
    //   color: #495057;
    // `;

    const tempo = this.audioPlayer?.getState().tempo || 120;
    const initialTempo = tempo.toFixed(2);

    // Number input with modern styling
    const input = document.createElement("input");
    input.type = "number";
    input.min = "40";
    input.max = "400";
    input.value = initialTempo.toString();
    input.style.cssText = `
      width: 80px;
      padding: 4px 8px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 600;
      color: ${COLOR_PRIMARY};
      background: rgba(0, 123, 255, 0.08);
      outline: none;
      text-align: center;
      /* Preserve native spin buttons */
    `;

    // Remove custom CSS that hid native number spinners (keep default browser UI)
    // const styleId = "tempo-input-style";

    const label = document.createElement("span");
    label.textContent = "BPM";
    label.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

    // Helper functions for tempo updates
    const clampTempo = (v: number) => Math.max(40, Math.min(400, v));
    const updateTempo = (value: number) => {
      let tempoVal = clampTempo(parseFloat(value.toFixed(2)));
      input.value = tempoVal.toString();
      this.audioPlayer?.setTempo(tempoVal);
    };

    // Adjust existing input listeners to use updateTempo
    input.addEventListener("input", () => {
      updateTempo(parseFloat(input.value) || 120);
    });

    // Enhanced focus styling
    input.addEventListener("focus", () => {
      input.style.background = "rgba(0, 123, 255, 0.15)";
      input.style.boxShadow = "0 0 0 3px rgba(0, 123, 255, 0.1)";
    });

    // Blur handler to reset styling and clamp value
    input.addEventListener("blur", () => {
      input.style.background = "rgba(0, 123, 255, 0.08)";
      input.style.boxShadow = "none";
      updateTempo(parseFloat(input.value) || 120);
    });

    // Handle Enter key
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
      }
    });

    // container.appendChild(icon);
    container.appendChild(input);
    container.appendChild(label);

    return container;
  }

  /**
   * Create a styled icon button
   */
  private createIconButton(
    iconSvg: string,
    onClick: () => void
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.innerHTML = iconSvg;
    button.onclick = onClick;
    button.style.cssText = `
      width: 36px;
      height: 36px;
      padding: 0;
      border: none;
      border-radius: 8px;
      background: #e9ecef;
      color: #6c757d;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      `;
    // box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

    button.addEventListener("mouseenter", () => {
      button.style.transform = "translateY(-1px)";
      button.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "translateY(0)";
      button.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.05)";
    });

    button.addEventListener("mousedown", () => {
      button.style.transform = "translateY(0) scale(0.95)";
    });

    button.addEventListener("mouseup", () => {
      button.style.transform = "translateY(-1px) scale(1)";
    });

    return button;
  }

  /**
   * Create zoom reset control
   */
  private createZoomControls(): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px;
      border-radius: 8px;
      gap: 4px;
    `;

    /* ------------------------------------------------------------------
     * Zoom-X input (numeric with native steppers)
     * ------------------------------------------------------------------ */
    const zoomInput = document.createElement("input");
    zoomInput.type = "number";
    zoomInput.min = "0.1";
    zoomInput.max = "10";
    zoomInput.step = "0.1";
    const currentZoom =
      this.pianoRollInstance?.getState?.().zoomX !== undefined
        ? (this.pianoRollInstance.getState() as any).zoomX
        : 1;
    zoomInput.value = currentZoom.toFixed(1);
    zoomInput.style.cssText = `
      width: 56px;
      padding: 4px 6px;
      border: 1px solid #ced4da;
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
      color: #20c997; /* teal */
      background: #ffffff;
    `;

    const clampZoom = (v: number) => Math.max(0.1, Math.min(10, v));

    const applyZoom = () => {
      const numericVal = parseFloat(zoomInput.value);
      if (isNaN(numericVal)) {
        // Revert to current zoom if invalid input
        const current = (this.pianoRollInstance?.getState?.().zoomX ??
          1) as number;
        zoomInput.value = current.toFixed(1);
        return;
      }
      const newZoom = clampZoom(numericVal);
      const prevZoom = (this.pianoRollInstance?.getState?.().zoomX ??
        1) as number;
      const factor = newZoom / prevZoom;
      this.pianoRollInstance?.zoomX?.(factor);
      zoomInput.value = newZoom.toFixed(1);
    };

    zoomInput.addEventListener("change", applyZoom);
    zoomInput.addEventListener("blur", applyZoom);

    // Keyboard: Enter key applies immediately
    zoomInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        applyZoom();
        zoomInput.blur();
      }
    });

    // Wheel over zoomInput → adjust ±0.1 steps
    zoomInput.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      const numeric = parseFloat(zoomInput.value) || currentZoom;
      zoomInput.value = (numeric + delta).toFixed(1);
      applyZoom();
    });

    // Static 'x' suffix label
    const zoomSuffix = document.createElement("span");
    zoomSuffix.textContent = "x";
    zoomSuffix.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

    // Reset view button using existing helper for consistent style
    const resetBtn = this.createIconButton(PLAYER_ICONS.zoom_reset, () => {
      this.pianoRollInstance?.resetView();
      // Sync inputs after reset
      // stepInput.value = (
      //   this.pianoRollInstance?.getTimeStep?.() || 1
      // ).toString();
      zoomInput.value = "1.0";
    });

    resetBtn.title = "Reset Zoom/Pan";

    // Append in order: zoom input, suffix, reset, settings (gear)
    // stepInputGroup is displayed in modal, not inline
    container.appendChild(zoomInput);
    container.appendChild(zoomSuffix);
    container.appendChild(resetBtn);

    return container;
  }

  private createSettingsControl(): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
    `;

    /* ------------------------------------------------------------------
     * Settings (gear) button – opens modal dialog with settings
     * ------------------------------------------------------------------ */
    const settingsBtn = this.createIconButton(PLAYER_ICONS.settings, () => {
      // Prevent multiple overlays
      if (document.getElementById("zoom-settings-overlay")) return;

      // Dark overlay
      const overlay = document.createElement("div");
      overlay.id = "zoom-settings-overlay";
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
      `;

      // Modal container
      const modal = document.createElement("div");
      modal.style.cssText = `
        background: #ffffff;
        padding: 24px 20px;
        border-radius: 10px;
        width: 320px;
        max-width: 90%;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        display: flex;
        flex-direction: column;
        gap: 12px;
      `;

      // Header with title + close button
      const header = document.createElement("div");
      header.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;

      const title = document.createElement("h3");
      title.textContent = "Zoom Settings";
      title.style.cssText = `
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: #343a40;
      `;

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "✕";
      closeBtn.style.cssText = `
        border: none;
        background: transparent;
        font-size: 18px;
        cursor: pointer;
        color: #6c757d;
      `;
      closeBtn.onclick = () => overlay.remove();

      header.appendChild(title);
      header.appendChild(closeBtn);

      /* ------------------------------------------------------------------
       * Time-step input group (hidden by default, toggled via ⚙︎ button)
       * ------------------------------------------------------------------ */
      const stepInputGroup = document.createElement("div");
      stepInputGroup.style.cssText = `
      display: none; /* toggled visible via settings button */
      align-items: center;
      gap: 4px;
    `;

      // Numeric input for time-step (grid spacing)
      const stepInput = document.createElement("input");
      const currentStep = this.pianoRollInstance?.getTimeStep?.() ?? 1.0;
      stepInput.type = "number";
      stepInput.min = "0.1";
      stepInput.step = "0.1";
      stepInput.value = currentStep.toString();
      stepInput.style.cssText = `
      width: 64px;
      padding: 4px 6px;
      border: 1px solid #ced4da;
      border-radius: 6px;
      font-size: 12px;
      text-align: center;
      color: #007bff;
      background: #ffffff;
    `;

      const applyStep = () => {
        const val = parseFloat(stepInput.value);
        if (!isNaN(val) && val > 0) {
          this.pianoRollInstance?.setTimeStep?.(val);
        }
      };
      stepInput.addEventListener("change", applyStep);
      stepInput.addEventListener("blur", applyStep);

      const stepLabel = document.createElement("label");
      stepLabel.textContent = "Time step:";
      stepLabel.style.cssText = `
        font-size: 12px;
        font-weight: 600;
        color: #6c757d;
      `;
      stepInputGroup.appendChild(stepLabel);
      const stepSuffix = document.createElement("span");
      stepSuffix.textContent = "s";
      stepSuffix.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

      stepInputGroup.appendChild(stepInput);
      stepInputGroup.appendChild(stepSuffix);
      // Settings content (currently only time-step group)
      stepInputGroup.style.display = "flex"; // ensure visible inside modal

      modal.appendChild(header);
      modal.appendChild(stepInputGroup);

      overlay.appendChild(modal);

      // Clicking outside modal closes overlay
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.remove();
      });

      document.body.appendChild(overlay);
    });
    settingsBtn.title = "Zoom Settings";
    container.appendChild(settingsBtn);

    return container;
  }

  /**
   * Start the update loop for time display and seek bar
   */
  private startUpdateLoop(): void {
    const updateInterval = setInterval(() => {
      if (!this.audioPlayer) {
        clearInterval(updateInterval);
        return;
      }

      const state = this.audioPlayer.getState();

      // Update time display
      if (this.options.showTimeDisplay) {
        const current = this.formatTime(state.currentTime);
        const total = this.formatTime(state.duration);
        const currentLabel = (this as any).currentTimeLabel;
        const totalLabel = (this as any).totalTimeLabel;
        if (currentLabel) currentLabel.textContent = current;
        if (totalLabel) totalLabel.textContent = total;

        // Update seek bar if not actively seeking
        const progressBar = (this as any).progressBar;
        const seekHandle = (this as any).seekHandle;
        const seeking = (this as any).seeking;
        if (progressBar && !seeking()) {
          const progress =
            state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
          progressBar.style.width = `${progress}%`;
          if (seekHandle) seekHandle.style.left = `${progress}%`;
          const progressIndicator = (this as any).progressIndicator;
          if (progressIndicator) progressIndicator.style.left = `${progress}%`;
        }

        // Update A-B loop display
        const loopPoints = (this as any).loopPoints;
        const loopRegion = (this as any).loopRegion;
        const markerA = (this as any).markerA;
        const markerB = (this as any).markerB;

        if (loopPoints && markerA && markerB) {
          // Always show marker A when available
          markerA.style.display = "block";
          markerA.style.left = `${loopPoints.a}%`;

          if (loopRegion) {
            if (loopPoints.b !== null) {
              console.log("[startUpdateLoop]");
              console.log([loopPoints.a, loopPoints.b]);
              console.log([loopRegion]);
              // Show region & marker B when both A and B exist
              loopRegion.style.display = "block";
              loopRegion.style.left = `${loopPoints.a}%`;
              loopRegion.style.width = `${loopPoints.b - loopPoints.a}%`;

              markerB.style.display = "block";
              markerB.style.left = `${loopPoints.b}%`;
            } else {
              // Hide region & marker B when only A exists
              loopRegion.style.display = "none";
              markerB.style.display = "none";
            }
          }
        } else if (loopRegion && markerA && markerB) {
          // Hide all when loopPoints is null
          loopRegion.style.display = "none";
          markerA.style.display = "none";
          markerB.style.display = "none";
        }
      }

      // Update play button state to keep it in sync
      const updatePlayButton = (this as any).updatePlayButton;
      if (updatePlayButton) {
        updatePlayButton();
      }
    }, 100); // Update 10 times per second
  }

  /**
   * Format time in MM:SS format
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.audioPlayer) {
      this.audioPlayer.destroy();
      this.audioPlayer = null;
    }

    if (this.pianoRollInstance) {
      this.pianoRollInstance.destroy();
      this.pianoRollInstance = null;
    }

    this.isInitialized = false;
  }

  /**
   * Get current player state for debugging
   */
  public getState(): any {
    return {
      isInitialized: this.isInitialized,
      audioPlayerState: this.audioPlayer?.getState(),
      pianoRollState: this.pianoRollInstance?.getState(),
    };
  }
}

/**
 * Factory function to create a player demo
 *
 * @param container - HTML element to attach the demo to
 * @param notes - Array of note data to play
 * @param options - Configuration options
 * @returns Promise that resolves to demo instance
 *
 * @example
 * ```typescript
 * import { createPlayerDemo } from './PlayerDemo';
 *
 * const container = document.getElementById('demo-container');
 * const demo = await createPlayerDemo(container, midiNotes, {
 *   player: { tempo: 140, volume: 0.8 },
 *   pianoRoll: { noteColor: 0x00ff00 }
 * });
 * ```
 */
export async function createPlayerDemo(
  container: HTMLElement,
  notes: NoteData[],
  options: PlayerDemoOptions = {}
): Promise<PlayerDemo> {
  const demo = new PlayerDemo(container, notes, options);
  await demo.initialize();
  return demo;
}
