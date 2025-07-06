/**
 * Player Demo - Integration example for AudioPlayer + PianoRoll
 *
 * Demonstrates how to create and control a synchronized audio player
 * with PixiJS piano roll visualization.
 */

import { NoteData } from "@/types";
import { createPianoRoll, PianoRollOptions } from "@/components/piano-roll";
import {
  createAudioPlayer,
  AudioPlayerControls,
  PlayerOptions,
} from "../../AudioPlayer";
import { PLAYER_ICONS } from "../../assets/player-icons";
import { COLOR_PRIMARY, COLOR_A, COLOR_B } from "./constants";
import { createPlaybackControls as buildPlaybackControls } from "@/core/controls/playback-controls";
import { createVolumeControl as buildVolumeControl } from "@/core/controls/volume-control";
import { createTempoControl as buildTempoControl } from "@/core/controls/tempo-control";
import { createZoomControls as buildZoomControls } from "@/core/controls/zoom-controls";
import { createSettingsControl as buildSettingsControl } from "@/core/controls/settings-control";
import { createLoopControls as buildLoopControls } from "@/core/controls/loop-controls";

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
        volume: 1.0,
        repeat: false,
        ...this.options.player,
      });

      // -------------------------------------------------------------
      // Keep UI & audio in sync when the user pans/zooms the piano roll
      // -------------------------------------------------------------
      this.pianoRollInstance?.onTimeChange?.((t: number) => {
        // Update audio position but keep the current manual pan intact
        this.audioPlayer?.seek(t, false);
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

    // Group 1: Playback controls (external module)
    const { element: playbackControls, updatePlayButton } =
      buildPlaybackControls(this.audioPlayer);
    controlsRow.appendChild(playbackControls);
    (this as any).updatePlayButton = updatePlayButton;

    // Group 2: A-B Loop controls
    const { element: loopControls, updateSeekBar: loopUpdate } =
      buildLoopControls({
        audioPlayer: this.audioPlayer,
        pianoRoll: this.pianoRollInstance,
        formatTime: this.formatTime.bind(this),
      });
    (this as any).updateSeekBar = loopUpdate;
    controlsRow.appendChild(loopControls);

    // Group 3: Volume Control
    const volumeControl = buildVolumeControl(this.audioPlayer);
    controlsRow.appendChild(volumeControl);

    // Group 4: Tempo Control
    const tempoControl = buildTempoControl(this.audioPlayer);
    controlsRow.appendChild(tempoControl);

    // Group 5: Zoom Reset Control
    const zoomResetControl = buildZoomControls(this.pianoRollInstance);
    controlsRow.appendChild(zoomResetControl);

    // Group 6: Settings Control
    const settingsControl = buildSettingsControl(this.pianoRollInstance);
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
        if (!btn.dataset.active) {
          btn.style.background = "rgba(0, 0, 0, 0.05)";
        }
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
      // Always restart from 0s, regardless of A-B loop settings
      this.audioPlayer?.seek(0);
      if (!this.audioPlayer?.getState().isPlaying) {
        this.audioPlayer?.play();
      }
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
    let isLoopRestartActive = false; // Track loop restart button state

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

      // Mark initial active status via data attribute
      if (isActive) {
        btn.dataset.active = "true";
      }

      return btn;
    };

    // Loop restart button - placed before A button
    const btnLoopRestart = document.createElement("button");
    btnLoopRestart.innerHTML = PLAYER_ICONS.loop_restart;
    btnLoopRestart.onclick = () => {
      // Toggle loop restart state
      isLoopRestartActive = !isLoopRestartActive;

      if (isLoopRestartActive) {
        // Activate loop restart mode
        btnLoopRestart.dataset.active = "true";
        btnLoopRestart.style.background = "rgba(0, 123, 255, 0.1)";
        btnLoopRestart.style.color = COLOR_PRIMARY;

        // If A and B points are set, apply the loop
        if (pointA !== null && pointB !== null) {
          this.audioPlayer?.setLoopPoints(pointA, pointB);
        } else if (pointA !== null) {
          // Only A is set, loop from A to end
          this.audioPlayer?.setLoopPoints(pointA, null);
        }

        // Start playing from A (or beginning if A not set)
        const startPoint = pointA !== null ? pointA : 0;
        this.audioPlayer?.seek(startPoint);
        if (!this.audioPlayer?.getState().isPlaying) {
          this.audioPlayer?.play();
        }
      } else {
        // Deactivate loop restart mode
        delete btnLoopRestart.dataset.active;
        btnLoopRestart.style.background = "transparent";
        btnLoopRestart.style.color = "#495057";

        // Clear loop points to play full track
        this.audioPlayer?.setLoopPoints(null, null);
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

          // Move piano roll playhead to A immediately (even when paused)
          this.pianoRollInstance?.setTime?.(pointA);
        }
      },
      false
    ); // Initially inactive - styled upon user action

    // B button
    const btnB = createLoopButton(
      "B",
      () => {
        const state = this.audioPlayer?.getState();
        if (state) {
          if (pointA === null) {
            // First point is being set via B button
            pointB = state.currentTime;

            // Style B as active
            btnB.style.background = `${COLOR_B}`;
            btnB.style.color = "white";
            btnB.style.fontWeight = "800";
            btnB.style.boxShadow = "inset 0 0 0 2px #ff7f00";
            btnB.dataset.active = "true";

            // Ensure A is inactive
            btnA.style.background = "transparent";
            btnA.style.color = "#495057";
            btnA.style.fontWeight = "600";
            btnA.style.boxShadow = "none";
            delete btnA.dataset.active;
          } else {
            // Record B point at current playback time
            pointB = state.currentTime;

            // Ensure chronological order A < B. If out of order swap.
            if (pointB < pointA) {
              [pointA, pointB] = [pointB, pointA];
            }

            // Active style for B
            btnB.style.background = `${COLOR_B}`;
            btnB.style.color = "white";
            btnB.style.fontWeight = "800";
            btnB.style.boxShadow = "inset 0 0 0 2px #ff7f00";
            btnB.dataset.active = "true";
          }

          // Re-render seek bar
          updateSeekBar();
        }
        console.log("[UI:B click] before swap", { pointA, pointB });
      },
      false
    ); // Initially inactive - styled upon user action

    // Clear button
    const btnClear = createLoopButton("✕", () => {
      const wasPlaying = this.audioPlayer?.getState().isPlaying;
      const currentTime = this.audioPlayer?.getState().currentTime || 0;

      pointA = null;
      pointB = null;
      isLooping = false;
      btnA.style.background = "transparent";
      btnA.style.color = "#495057";
      btnA.style.fontWeight = "600";
      btnA.style.boxShadow = "none";
      delete btnA.dataset.active;
      btnB.style.background = "transparent";
      btnB.style.color = "#495057";
      btnB.style.fontWeight = "600";
      btnB.style.boxShadow = "none";
      delete btnB.dataset.active;
      updateSeekBar();

      // If loop restart is active, clear the loop points
      if (isLoopRestartActive) {
        this.audioPlayer?.setLoopPoints(null, null);

        // If was playing, continue playing from current position
        if (wasPlaying) {
          // Small delay to ensure the audio system is ready after clearing loop
          setTimeout(() => {
            this.audioPlayer?.seek(currentTime);
            this.audioPlayer?.play();
          }, 100);
        }
      }
    });
    btnClear.style.fontSize = "16px";
    btnClear.title = "Clear A-B Loop";

    // Update seek bar to show A-B region
    const updateSeekBar = () => {
      const progressBar = (this as any).progressBar;
      const seekBarContainer = (this as any).seekBarContainer;
      if (progressBar && seekBarContainer) {
        const state = this.audioPlayer?.getState();
        if (state && state.duration > 0) {
          // Case 1: we have A (and maybe B)
          if (pointA !== null) {
            let start = pointA;
            let end: number | null = pointB;

            if (end !== null && start > end) {
              [start, end] = [end, start];
            }

            // Clamp end within piece length in case user picked beyond audio.
            const clampedEnd =
              end !== null ? Math.min(end, state.duration) : null;
            const aPercent = (start / state.duration) * 100;
            const bPercent =
              clampedEnd !== null ? (clampedEnd / state.duration) * 100 : null;
            (this as any).loopPoints = { a: aPercent, b: bPercent };

            // Update time labels when A (and optionally B) exist
            {
              const labelA = (this as any).markerATimeLabel as
                | HTMLElement
                | undefined;
              if (labelA) labelA.textContent = this.formatTime(start);
              const labelB = (this as any).markerBTimeLabel as
                | HTMLElement
                | undefined;
              if (labelB && clampedEnd !== null) {
                labelB.textContent = this.formatTime(clampedEnd);
              }
            }

            // Sync audio loop points only when restart mode is on
            if (isLoopRestartActive) {
              this.audioPlayer?.setLoopPoints?.(start, clampedEnd);
            }

            /* -------------------------------------------------------------
             * Always forward loop markers to piano roll:
             *   • Both A,B   → (start,end)
             *   • Only   A   → (start,null)
             * ------------------------------------------------------------- */
            this.pianoRollInstance?.setLoopWindow?.(start, clampedEnd);
            return;
          }

          // Case 2: only B is defined
          if (pointA === null && pointB !== null) {
            const clampedB = Math.min(pointB, state.duration);
            const bPercent = (clampedB / state.duration) * 100;
            (this as any).loopPoints = { a: null, b: bPercent };

            // Update time label when only B exists
            {
              const labelB = (this as any).markerBTimeLabel as
                | HTMLElement
                | undefined;
              if (labelB) labelB.textContent = this.formatTime(clampedB);
            }

            // Only apply loop from start to B if loop restart is active
            if (isLoopRestartActive) {
              this.audioPlayer?.setLoopPoints?.(null, clampedB);
            }

            // Forward single B marker to piano roll
            this.pianoRollInstance?.setLoopWindow?.(null, clampedB);
            return;
          }
        }
      }
      // No valid loop data - reset
      (this as any).loopPoints = null;

      // Clear overlay on piano roll
      this.pianoRollInstance?.setLoopWindow?.(null, null);

      // Clear loop range on audio player only if loop restart is active
      if (isLoopRestartActive) {
        this.audioPlayer?.setLoopPoints?.(null, null);
      }
    };

    // Store references
    (this as any).updateSeekBar = updateSeekBar;

    container.appendChild(btnLoopRestart);
    container.appendChild(btnA);
    container.appendChild(btnB);
    container.appendChild(btnClear);

    // Initialize with virtual points
    setTimeout(() => {
      // Don't apply loops on initialization
      updateSeekBar();
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
      (this as any).markerATimeLabel = labelATime;
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
      (this as any).markerBTimeLabel = labelBTime;
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

    // Wheel over zoomInput → adjust ±0.1 steps; mark listener as non-passive
    zoomInput.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        const numeric = parseFloat(zoomInput.value) || currentZoom;
        zoomInput.value = (numeric + delta).toFixed(1);
        applyZoom();
      },
      { passive: false }
    );

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

    // Expose zoom input for external sync (e.g., mouse-wheel zoom on canvas)
    (this as any).zoomInput = zoomInput;

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
          // Handle marker A
          if (loopPoints.a !== null) {
            markerA.style.display = "block";
            markerA.style.left = `${loopPoints.a}%`;
          } else {
            markerA.style.display = "none";
          }

          // Handle marker B
          if (loopPoints.b !== null) {
            markerB.style.display = "block";
            markerB.style.left = `${loopPoints.b}%`;
          } else {
            markerB.style.display = "none";
          }

          if (loopRegion) {
            if (loopPoints.a !== null && loopPoints.b !== null) {
              // Both markers exist - show region between them
              loopRegion.style.display = "block";
              loopRegion.style.left = `${loopPoints.a}%`;
              loopRegion.style.width = `${loopPoints.b - loopPoints.a}%`;
            } else {
              loopRegion.style.display = "none";
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

      // ------------------------------------------------------------------
      // Keep zoomInput value in sync with actual piano roll zoom level
      // ------------------------------------------------------------------
      const zoomInputElem = (this as any).zoomInput as
        | HTMLInputElement
        | undefined;
      if (zoomInputElem && document.activeElement !== zoomInputElem) {
        const zoomState = this.pianoRollInstance?.getState?.().zoomX;
        if (zoomState !== undefined) {
          const formatted = zoomState.toFixed(1);
          if (zoomInputElem.value !== formatted) {
            zoomInputElem.value = formatted;
          }
        }
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
