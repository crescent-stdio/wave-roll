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
        background: white;
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
      gap: 15px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
      border: 1px solid #e9ecef;
    `;

    // Main playback controls
    const playbackControls = this.createPlaybackControls();
    this.controlsContainer.appendChild(playbackControls);

    // Time display
    if (this.options.showTimeDisplay) {
      const timeDisplay = this.createTimeDisplay();
      this.controlsContainer.appendChild(timeDisplay);
    }

    // Volume control
    if (this.options.showVolumeControl) {
      const volumeControl = this.createVolumeControl();
      this.controlsContainer.appendChild(volumeControl);
    }

    // Tempo control
    if (this.options.showTempoControl) {
      const tempoControl = this.createTempoControl();
      this.controlsContainer.appendChild(tempoControl);
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
      gap: 10px;
      align-items: center;
    `;

    // Play/Pause button with simplified logic
    const playBtn = this.createButton("Play", async () => {
      // This will be replaced by the updatePlayButton function
    });

    // Function to update play button state and behavior
    const updatePlayButton = () => {
      const state = this.audioPlayer?.getState();
      if (state?.isPlaying) {
        playBtn.textContent = "Pause";
        playBtn.onclick = () => {
          this.audioPlayer?.pause();
          updatePlayButton();
        };
      } else {
        playBtn.textContent = "Play";
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

    // Set initial state
    updatePlayButton();

    // Restart button
    const restartBtn = this.createButton("Restart", () => {
      this.audioPlayer?.restart();
      updatePlayButton(); // Update play button state after restart
    });

    // Repeat toggle
    const repeatBtn = this.createButton("Repeat: Off", () => {
      const state = this.audioPlayer?.getState();
      const newRepeat = !state?.isRepeating;
      this.audioPlayer?.toggleRepeat(newRepeat);
      repeatBtn.textContent = `Repeat: ${newRepeat ? "On" : "Off"}`;
      repeatBtn.style.backgroundColor = newRepeat ? "#28a745" : "#6c757d";
    });

    container.appendChild(playBtn);
    container.appendChild(restartBtn);
    container.appendChild(repeatBtn);

    // Store updatePlayButton for use in update loop
    (this as any).updatePlayButton = updatePlayButton;

    return container;
  }

  /**
   * Create time display and seek bar
   */
  private createTimeDisplay(): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    // Time text display
    this.timeDisplay.style.cssText = `
      font-family: 'Courier New', monospace;
      font-size: 14px;
      color: #495057;
      text-align: center;
    `;
    this.timeDisplay.textContent = "00:00 / 00:00";

    // Seek bar
    const seekBar = document.createElement("input");
    seekBar.type = "range";
    seekBar.min = "0";
    seekBar.max = "100";
    seekBar.value = "0";
    seekBar.style.cssText = `
      width: 100%;
      cursor: pointer;
    `;

    let seeking = false;
    seekBar.addEventListener("mousedown", () => (seeking = true));
    seekBar.addEventListener("mouseup", () => (seeking = false));

    // Handle seeking - use only 'input' event for real-time updates
    const handleSeek = () => {
      const state = this.audioPlayer?.getState();
      if (state) {
        const seekTime = (parseFloat(seekBar.value) / 100) * state.duration;
        this.audioPlayer?.seek(seekTime);
      }
    };

    // Use only 'input' event - it fires both during drag and on direct clicks
    seekBar.addEventListener("input", handleSeek);

    // Store reference for updates
    (this as any).seekBar = seekBar;
    (this as any).seeking = () => seeking;

    container.appendChild(this.timeDisplay);
    container.appendChild(seekBar);

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
    `;

    const label = document.createElement("label");
    label.textContent = "Volume:";
    label.style.cssText = `
      font-size: 14px;
      font-weight: 500;
      min-width: 80px;
    `;

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = "70";
    slider.style.cssText = `
      flex: 1;
      cursor: pointer;
    `;

    const valueDisplay = document.createElement("span");
    valueDisplay.textContent = "70%";
    valueDisplay.style.cssText = `
      font-size: 12px;
      color: #6c757d;
      min-width: 35px;
      text-align: right;
    `;

    slider.addEventListener("input", () => {
      const volume = parseFloat(slider.value) / 100;
      this.audioPlayer?.setVolume(volume);
      valueDisplay.textContent = `${slider.value}%`;
    });

    container.appendChild(label);
    container.appendChild(slider);
    container.appendChild(valueDisplay);

    return container;
  }

  /**
   * Create tempo control slider
   */
  private createTempoControl(): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
    `;

    const label = document.createElement("label");
    label.textContent = "Tempo:";
    label.style.cssText = `
      font-size: 14px;
      font-weight: 500;
      min-width: 80px;
    `;

    const slider = document.createElement("input");
    slider.type = "range";
    const initialTempo = this.audioPlayer?.getState().tempo || 120;

    slider.min = "60";
    slider.max = "300";
    slider.value = initialTempo.toString();
    slider.style.cssText = `
      flex: 1;
      cursor: pointer;
    `;

    const valueDisplay = document.createElement("span");
    valueDisplay.textContent = `${initialTempo} BPM`;
    valueDisplay.style.cssText = `
      font-size: 12px;
      color: #6c757d;
      min-width: 60px;
      text-align: right;
    `;

    slider.addEventListener("input", () => {
      const tempo = parseFloat(slider.value);
      this.audioPlayer?.setTempo(tempo);
      valueDisplay.textContent = `${slider.value} BPM`;
    });

    container.appendChild(label);
    container.appendChild(slider);
    container.appendChild(valueDisplay);

    return container;
  }

  /**
   * Create a styled button
   */
  private createButton(text: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = text;
    button.onclick = onClick;
    button.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      background: #007bff;
      color: white;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background-color 0.2s;
    `;

    button.addEventListener("mouseenter", () => {
      button.style.backgroundColor = "#0056b3";
    });

    button.addEventListener("mouseleave", () => {
      if (!button.textContent?.includes("Repeat: On")) {
        button.style.backgroundColor = "#007bff";
      }
    });

    return button;
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
        this.timeDisplay.textContent = `${current} / ${total}`;

        // Update seek bar if not actively seeking
        const seekBar = (this as any).seekBar;
        const seeking = (this as any).seeking;
        if (seekBar && !seeking()) {
          const progress =
            state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
          seekBar.value = progress.toString();
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
