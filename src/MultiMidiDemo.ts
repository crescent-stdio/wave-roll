/**
 * MultiMidiDemo - Demo component for multiple MIDI files with visualization
 */

import { PlayerDemo, PlayerDemoOptions } from "./PlayerDemo";
import {
  MultiMidiManager,
  MidiFileEntry,
  DEFAULT_PALETTES,
} from "./MultiMidiManager";
import { parseMidi } from "./midi-parser";
import { NoteData, ParsedMidi } from "./types";
import { PLAYER_ICONS } from "./icons";
import { createPianoRoll } from "./piano-roll";
import { createAudioPlayer, AudioPlayerControls } from "./AudioPlayer";

// Color constants from PlayerDemo
const COLOR_PRIMARY = "#0984e3"; // Vibrant blue
const COLOR_A = "#00b894"; // Teal
const COLOR_B = "#e74c3c"; // Vibrant red-orange
const COLOR_OVERLAP = "#9b59b6"; // Purple for overlapping notes

/**
 * Helper to detect overlapping notes
 */
function detectOverlappingNotes(
  notes: Array<{ note: NoteData; color: number; fileId: string }>
): Map<number, boolean> {
  const overlappingIndices = new Map<number, boolean>();

  for (let i = 0; i < notes.length; i++) {
    const noteA = notes[i].note;
    for (let j = i + 1; j < notes.length; j++) {
      const noteB = notes[j].note;

      // Check if notes overlap in time and are from different files
      if (
        notes[i].fileId !== notes[j].fileId &&
        noteA.midi === noteB.midi &&
        noteA.time < noteB.time + noteB.duration &&
        noteB.time < noteA.time + noteA.duration
      ) {
        overlappingIndices.set(i, true);
        overlappingIndices.set(j, true);
      }
    }
  }

  return overlappingIndices;
}

/**
 * Convert RGB integer values (0-255) to HSV.
 *
 * @param r Red   component in [0, 255]
 * @param g Green component in [0, 255]
 * @param b Blue  component in [0, 255]
 * @returns Tuple containing hue (deg 0-360), saturation (0-1) and value (0-1)
 */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return [h, s, v];
}

/**
 * Convert HSV values back to RGB.
 *
 * @param h Hue in degrees [0, 360)
 * @param s Saturation in [0, 1]
 * @param v Value in [0, 1]
 * @returns Tuple with RGB integer values in [0, 255]
 */
function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));

  let r1 = 0,
    g1 = 0,
    b1 = 0;

  if (hh >= 0 && hh < 1) {
    r1 = c;
    g1 = x;
  } else if (hh >= 1 && hh < 2) {
    r1 = x;
    g1 = c;
  } else if (hh >= 2 && hh < 3) {
    g1 = c;
    b1 = x;
  } else if (hh >= 3 && hh < 4) {
    g1 = x;
    b1 = c;
  } else if (hh >= 4 && hh < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const m = v - c;
  // Base RGB values in 0..255
  const rBase = (r1 + m) * 255;
  const gBase = (g1 + m) * 255;
  const bBase = (b1 + m) * 255;

  // Lighten the colour slightly to avoid overly vivid tones.
  const lightenFactor = 0.2; // 0 = original colour, 1 = pure white
  const r = Math.round(rBase + (255 - rBase) * lightenFactor);
  const g = Math.round(gBase + (255 - gBase) * lightenFactor);
  const b = Math.round(bBase + (255 - bBase) * lightenFactor);

  return [r, g, b];
}

/**
 * Blend multiple RGB colors using an unweighted average in HSV space.
 * This approach preserves hue relationships better than direct RGB averaging,
 * producing more visually pleasing results when many colours overlap.
 *
 * @param colors Array of colours as 0xRRGGBB numbers.
 * @param weights Ignored – kept for backwards-compatibility.
 * @returns Blended colour as 0xRRGGBB.
 */
function blendColorsAverage(colors: number[], _weights: number[] = []): number {
  if (colors.length === 0) {
    return 0xffffff;
  }

  let sumX = 0;
  let sumY = 0;
  let sumS = 0;
  let sumV = 0;

  for (const c of colors) {
    const r = (c >> 16) & 0xff;
    const g = (c >> 8) & 0xff;
    const b = c & 0xff;

    const [h, s, v] = rgbToHsv(r, g, b);
    const rad = (h * Math.PI) / 180;
    sumX += Math.cos(rad);
    sumY += Math.sin(rad);
    sumS += s;
    sumV += v;
  }

  const n = colors.length;
  const avgH = Math.atan2(sumY / n, sumX / n);
  const hueDeg = (avgH * 180) / Math.PI + (avgH < 0 ? 360 : 0);
  const sat = Math.min(1, Math.max(0, sumS / n));
  const val = Math.min(1, Math.max(0, sumV / n));

  const [r, g, b] = hsvToRgb(hueDeg, sat, val);
  return (r << 16) | (g << 8) | b;
}

/**
 * Demo for multiple MIDI files
 */
export class MultiMidiDemo {
  private container: HTMLElement;
  private midiManager: MultiMidiManager;
  private playerDemo: PlayerDemo | null = null;
  private pianoRollInstance: any = null;
  private audioPlayer: AudioPlayerControls | null = null;
  // Store dynamic colours so noteRenderer can reference them without having to recreate
  private currentNoteColors: number[] = [];
  // DOM element that hosts the PixiJS piano-roll canvas (for toggling visibility)
  private pianoRollDiv: HTMLElement | null = null;

  private mainContainer: HTMLElement;
  private sidebarContainer: HTMLElement;
  private playerContainer: HTMLElement;
  private controlsContainer: HTMLElement;

  // UI elements from PlayerDemo
  private timeDisplay: HTMLElement;
  private progressBar: HTMLElement | null = null;
  private seekHandle: HTMLElement | null = null;
  private seeking: boolean = false;
  private currentTimeLabel: HTMLElement | null = null;
  private totalTimeLabel: HTMLElement | null = null;
  private seekBarContainer: HTMLElement | null = null;
  private loopRegion: HTMLElement | null = null;
  private markerA: HTMLElement | null = null;
  private markerB: HTMLElement | null = null;
  private loopPoints: { a: number | null; b: number | null } | null = null;
  private updateSeekBar: (() => void) | null = null;
  private updatePlayButton: (() => void) | null = null;
  private progressIndicator: HTMLElement | null = null;
  private markerATimeLabel: HTMLElement | null = null;
  private markerBTimeLabel: HTMLElement | null = null;
  private zoomInput: HTMLInputElement | null = null;
  // Container that holds per-file visibility checkboxes under the player UI
  private fileToggleContainer: HTMLElement | null = null;
  // Holds the interval ID for the UI sync loop (seekbar / timers)
  private updateLoopId: number | null = null;

  // Flag to suppress repeated re-renders during bulk MIDI loads
  private isBatchLoading: boolean = false;

  // Grid subdivision (minor) step in seconds
  private minorTimeStep: number = 0.1;
  // Map of file-ID → function(panValue)
  // Allows global L/R controls to synchronise individual sliders.
  private filePanStateHandlers: Record<string, (pan: number | null) => void> =
    {};

  // Persist per-file pan value so the UI maintains state across re-renders.
  private filePanValues: Record<string, number> = {};

  // Track mute state when neither L nor R channel is active
  private muteDueNoLR: boolean = false;
  private lastVolumeBeforeMute: number = 0.7;

  // Store any user-supplied files so we can load them on initialize()
  private initialFiles: Array<{ path: string; displayName?: string }> = [];

  constructor(
    container: HTMLElement,
    initialFiles: Array<{ path: string; displayName?: string }> = []
  ) {
    this.container = container;
    this.midiManager = new MultiMidiManager();

    // Store any user-supplied files so we can load them on initialize()
    this.initialFiles = initialFiles;

    // Create layout containers
    this.mainContainer = document.createElement("div");
    this.sidebarContainer = document.createElement("div");
    this.playerContainer = document.createElement("div");
    this.controlsContainer = document.createElement("div");
    this.timeDisplay = document.createElement("div");
  }

  /**
   * Initialize the demo
   */
  public async initialize(): Promise<void> {
    // Set up layout
    this.setupLayout();

    // Set up state change listener
    this.midiManager.setOnStateChange(() => {
      if (this.isBatchLoading) return; // defer updates until batch load finishes
      this.updateVisualization();
      this.updateSidebar();
      this.updateFileToggleSection();
    });

    // Load user-supplied files if provided, otherwise fallback to default sample files
    if (this.initialFiles && this.initialFiles.length > 0) {
      await this.loadSampleFiles(this.initialFiles);
    } else {
      await this.loadSampleFiles();
    }
  }

  /**
   * Set up the main layout
   */
  private setupLayout(): void {
    // Clear container
    this.container.innerHTML = "";

    // Main container styles
    this.mainContainer.style.cssText = `
      display: flex;
      gap: 20px;
      height: 100%;
      min-height: 600px;
    `;

    // Sidebar styles
    this.sidebarContainer.style.cssText = `
      width: 280px;
      background: #f8f9fa;
      border-radius: 8px;
      padding: 16px;
      overflow-y: auto;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    `;

    // Player container styles
    this.playerContainer.style.cssText = `
      flex: 1;
      min-width: 0;
    `;

    // Assemble layout
    this.mainContainer.appendChild(this.sidebarContainer);
    this.mainContainer.appendChild(this.playerContainer);
    this.container.appendChild(this.mainContainer);

    // Initial sidebar setup
    this.setupSidebar();

    // File-visibility toggle checkboxes (placed under the player controls)
    this.setupFileToggleSection();

    // Start update loop for time display
    this.startUpdateLoop();
  }

  /**
   * Set up the sidebar
   */
  private setupSidebar(): void {
    this.sidebarContainer.innerHTML = "";

    // Title
    const title = document.createElement("h3");
    title.textContent = "MIDI Files";
    title.style.cssText = `
      margin: 0 0 16px 0;
      font-size: 18px;
      font-weight: 600;
      color: #343a40;
    `;
    this.sidebarContainer.appendChild(title);

    // File list container
    const fileListContainer = document.createElement("div");
    fileListContainer.id = "midi-file-list";
    fileListContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    `;
    this.sidebarContainer.appendChild(fileListContainer);

    // Add settings button at the bottom
    const settingsBtn = document.createElement("button");
    settingsBtn.innerHTML = `${PLAYER_ICONS.settings} <span>MIDI Settings</span>`;
    settingsBtn.style.cssText = `
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      background: #e9ecef;
      color: #495057;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
      margin-top: auto;
    `;

    settingsBtn.addEventListener("mouseenter", () => {
      settingsBtn.style.background = "#dee2e6";
    });

    settingsBtn.addEventListener("mouseleave", () => {
      settingsBtn.style.background = "#e9ecef";
    });

    settingsBtn.addEventListener("click", () => {
      this.openSettingsModal();
    });

    this.sidebarContainer.appendChild(settingsBtn);
  }

  /**
   * Update sidebar with current files
   */
  private updateSidebar(): void {
    const fileList = document.getElementById("midi-file-list");
    if (!fileList) return;

    fileList.innerHTML = "";

    const state = this.midiManager.getState();

    state.files.forEach((file) => {
      const fileItem = this.createFileItem(file);
      fileList.appendChild(fileItem);
    });

    // Show empty state if no files
    if (state.files.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.style.cssText = `
        text-align: center;
        color: #6c757d;
        padding: 40px 20px;
        font-size: 14px;
      `;
      emptyState.textContent =
        "No MIDI files loaded. Click settings to add files.";
      fileList.appendChild(emptyState);
    }
  }

  /**
   * Create a file item for the sidebar
   */
  private createFileItem(file: MidiFileEntry): HTMLElement {
    const item = document.createElement("div");
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: white;
      border-radius: 6px;
      border: 1px solid #dee2e6;
      transition: all 0.2s ease;
    `;

    // Visibility toggle using eye icon
    const visBtn = document.createElement("button");
    const isVisible = file.isVisible;
    visBtn.innerHTML = isVisible
      ? PLAYER_ICONS.eye_open
      : PLAYER_ICONS.eye_closed;
    visBtn.style.cssText = `
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${isVisible ? "#495057" : "#adb5bd"};
      transition: color 0.15s ease;
    `;

    visBtn.addEventListener("click", () => {
      this.midiManager.toggleVisibility(file.id);
    });

    // Color indicator
    const colorIndicator = document.createElement("div");
    colorIndicator.style.cssText = `
      width: 12px;
      height: 12px;
      border-radius: 3px;
      background: #${file.color.toString(16).padStart(6, "0")};
      flex-shrink: 0;
    `;

    // File name
    const fileName = document.createElement("span");
    fileName.textContent = file.displayName;
    fileName.style.cssText = `
      flex: 1;
      font-size: 14px;
      color: ${file.isVisible ? "#343a40" : "#6c757d"};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;

    // Hover effect
    item.addEventListener("mouseenter", () => {
      item.style.borderColor = "#0984e3";
      item.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
    });

    item.addEventListener("mouseleave", () => {
      item.style.borderColor = "#dee2e6";
      item.style.boxShadow = "none";
    });

    item.appendChild(visBtn);
    item.appendChild(colorIndicator);
    item.appendChild(fileName);

    return item;
  }

  /**
   * Load sample MIDI files
   */
  private async loadSampleFiles(
    files: Array<{ path: string; displayName?: string }> = []
  ): Promise<void> {
    this.isBatchLoading = true;

    const fileList =
      files.length > 0
        ? files
        : [
            {
              path: "./src/sample_midi/basic_pitch_transcription.mid",
              displayName: "Basic Pitch Transcription",
            },
            {
              path: "./src/sample_midi/cut_liszt.mid",
              displayName: "Cut Liszt",
            },
          ];

    for (const file of fileList) {
      try {
        const parsedData = await parseMidi(file.path);
        this.midiManager.addMidiFile(file.path, parsedData, file.displayName);
      } catch (error) {
        console.error(`Failed to load ${file.path}:`, error);
      }
    }

    // All sample files processed, trigger one visualization update
    this.isBatchLoading = false;
    this.updateSidebar();
    await this.updateVisualization();
  }

  /**
   * Update visualization with current visible notes
   */
  private async updateVisualization(): Promise<void> {
    const visibleNotes = this.midiManager.getVisibleNotes();

    if (visibleNotes.length === 0) {
      // Pause playback but keep an empty piano roll visible.
      // This allows users to re-enable tracks without losing the visual context.
      this.audioPlayer?.pause();

      // Ensure the piano-roll canvas stays visible.
      if (this.pianoRollDiv) {
        this.pianoRollDiv.style.display = "block";
      }

      // Always show an empty grid
      if (this.pianoRollInstance) {
        this.currentNoteColors = [];
        this.pianoRollInstance.setNotes([]);
      }

      // Recreate the audio player with *no* notes so the timeline resets to 0 s
      const prevState = this.audioPlayer?.getState();
      const prevVolume = prevState?.volume ?? 0.7;
      const prevTempo = prevState?.tempo ?? 120;
      const prevPan = prevState?.pan ?? 0;
      const prevRepeat = prevState?.isRepeating ?? false;

      if (this.audioPlayer) {
        this.audioPlayer.destroy();
        this.audioPlayer = null;
      }

      if (this.pianoRollInstance) {
        this.audioPlayer = createAudioPlayer([], this.pianoRollInstance, {
          tempo: prevTempo,
          volume: prevVolume,
          repeat: prevRepeat,
        });
        this.audioPlayer.setPan(prevPan);
      }

      // Keep the UI (seek bar, timers) updated even when empty
      this.startUpdateLoop();

      return; // Exit early – nothing else to render when there are no notes.
    } else {
      // Detect overlapping notes BEFORE transforming into NoteData[]
      const overlappingIndices = detectOverlappingNotes(visibleNotes);

      // Build parallel arrays for notes and their (possibly blended) colours.
      const notes: NoteData[] = [];
      const noteColors: number[] = [];

      visibleNotes.forEach((item, idx) => {
        notes.push(item.note);
        // Gather colors (and velocities) of all notes that overlap with `item`.
        const mixColors: number[] = [item.color];
        const mixWeights: number[] = [item.note.velocity ?? 1];
        for (let j = 0; j < visibleNotes.length; j++) {
          if (j === idx) continue;
          const other = visibleNotes[j];
          const noteA = item.note;
          const noteB = other.note;
          // Same overlap criteria as detectOverlappingNotes
          if (
            item.fileId !== other.fileId &&
            noteA.midi === noteB.midi &&
            noteA.time < noteB.time + noteB.duration &&
            noteB.time < noteA.time + noteA.duration
          ) {
            mixColors.push(other.color);
            mixWeights.push(other.note.velocity ?? 1);
          }
        }
        if (mixColors.length > 1) {
          // noteColors.push(blendColorsAverage(mixColors, mixWeights));
          noteColors.push(0xaaaaaa);
        } else {
          noteColors.push(item.color);
        }
      });

      // ------------------------------------------------------------------
      // If a piano roll already exists, simply update its notes & colours
      // instead of destroying and recreating the expensive PixiJS instance.
      // ------------------------------------------------------------------

      if (this.pianoRollInstance) {
        // Refresh colour mapping for existing noteRenderer (uses this.currentNoteColors)
        this.currentNoteColors = noteColors;
        this.pianoRollInstance.setNotes(notes);

        // Ensure the canvas is visible again (may have been hidden earlier)
        if (this.pianoRollDiv) {
          this.pianoRollDiv.style.display = "block";
        }

        // ---- Audio player still needs to reflect the new note set ----
        const prevAudioState = this.audioPlayer?.getState();
        const wasPlaying = prevAudioState?.isPlaying ?? false;
        const prevTime = prevAudioState?.currentTime ?? 0;
        const prevTempo = prevAudioState?.tempo ?? 120;
        const prevVolume = prevAudioState?.volume ?? 0.7;
        const prevRepeat = prevAudioState?.isRepeating ?? false;
        const prevPan = prevAudioState?.pan ?? 0;

        if (this.audioPlayer) {
          this.audioPlayer.destroy();
          this.audioPlayer = null;
        }

        this.audioPlayer = createAudioPlayer(notes, this.pianoRollInstance, {
          tempo: prevTempo,
          volume: prevVolume,
          repeat: prevRepeat,
        });

        // Restore previous playback state
        this.audioPlayer.setPan(prevPan);

        // Delay state restoration to ensure AudioPlayer is fully initialized
        setTimeout(async () => {
          if (this.audioPlayer) {
            this.audioPlayer.seek(prevTime, false);
            if (wasPlaying) {
              try {
                await this.audioPlayer.play();
              } catch (error) {
                console.error(
                  "Failed to resume playback after visibility toggle:",
                  error
                );
              }
            }
          }
        }, 100);

        // Re-sync time change callback
        this.pianoRollInstance.onTimeChange?.((t: number) => {
          this.audioPlayer?.seek(t, false);
        });

        // Ensure updated minorTimeStep
        if (this.pianoRollInstance.setMinorTimeStep) {
          this.pianoRollInstance.setMinorTimeStep(this.minorTimeStep);
        }

        // Keep seek-bar / timers in sync
        this.startUpdateLoop();
        // Update file-toggle UI to reflect any colour changes
        this.updateFileToggleSection();
        return; // ✅ Early exit – no expensive recreation required
      }

      // -------------------------------------------------------------
      // First-time creation path (no existing piano roll instance).
      // -------------------------------------------------------------

      // Preserve existing playback/visual state before reconstruction
      const prevAudioState = this.audioPlayer?.getState();
      const wasPlaying = prevAudioState?.isPlaying ?? false;
      const prevTime = prevAudioState?.currentTime ?? 0;
      const prevTempo = prevAudioState?.tempo ?? 120;
      const prevVolume = prevAudioState?.volume ?? 0.7;
      const prevRepeat = prevAudioState?.isRepeating ?? false;
      const prevPan = prevAudioState?.pan ?? 0;
      const prevZoomX =
        this.pianoRollInstance?.getState?.().zoomX !== undefined
          ? (this.pianoRollInstance.getState() as any).zoomX
          : 1;

      // Clean up previous audio instance (piano roll is already null here)
      if (this.audioPlayer) {
        this.audioPlayer.destroy();
        this.audioPlayer = null;
      }

      // Clear container & create a fresh piano roll container
      this.playerContainer.innerHTML = "";

      const pianoRollContainer = document.createElement("div");
      pianoRollContainer.style.cssText = `
        width: 100%;
        height: 400px;
        border: 1px solid #ddd;
        border-radius: 8px;
        margin-bottom: 20px;
        background: #ffffff;
      `;
      this.playerContainer.appendChild(pianoRollContainer);

      // Store reference for future show/hide operations
      this.pianoRollDiv = pianoRollContainer;

      // Save colour mapping for noteRenderer
      this.currentNoteColors = noteColors;

      // Create piano roll with per-note colours
      this.pianoRollInstance = await createPianoRoll(
        pianoRollContainer,
        notes,
        {
          width: pianoRollContainer.clientWidth || 800,
          height: 380,
          backgroundColor: 0xffffff,
          playheadColor: 0xff4444,
          showPianoKeys: true,
          noteRange: { min: 21, max: 108 },
          noteRenderer: (_note: NoteData, index: number) =>
            this.currentNoteColors[index],
          minorTimeStep: this.minorTimeStep,
        }
      );

      // Create new audio player
      this.audioPlayer = createAudioPlayer(notes, this.pianoRollInstance, {
        tempo: prevTempo,
        volume: prevVolume,
        repeat: prevRepeat,
      });

      // Restore previous playback state (position, pan, play status, zoom)
      if (prevAudioState) {
        // Restore pan first so stereo field matches immediately
        this.audioPlayer.setPan(prevPan);

        // Re-apply previous zoom level if it differed from default
        if (prevZoomX && prevZoomX !== 1 && this.pianoRollInstance?.zoomX) {
          this.pianoRollInstance.zoomX(prevZoomX);
        }

        // Delay state restoration to ensure AudioPlayer is fully initialized
        setTimeout(async () => {
          if (this.audioPlayer && this.pianoRollInstance) {
            // Seek to previous position (without triggering visual update twice)
            this.audioPlayer.seek(prevTime, false);
            this.pianoRollInstance.setTime(prevTime);

            // Resume playback if it was playing before the update
            if (wasPlaying) {
              try {
                await this.audioPlayer.play();
              } catch (error) {
                console.error(
                  "Failed to resume playback after visibility toggle:",
                  error
                );
              }
            }
          }
        }, 100);
      }

      // Sync time changes
      this.pianoRollInstance.onTimeChange?.((t: number) => {
        this.audioPlayer?.seek(t, false);
      });

      // Re-create controls UI if it hasn't been built yet
      if (!this.controlsContainer.hasChildNodes()) {
        this.setupUI();
      }

      // Ensure the controls container is attached to DOM (might have been cleared)
      if (!this.controlsContainer.parentElement) {
        this.playerContainer.appendChild(this.controlsContainer);
      }

      // Handle file-toggle section
      if (this.fileToggleContainer) {
        if (!this.fileToggleContainer.parentElement) {
          this.playerContainer.appendChild(this.fileToggleContainer);
        }
        this.updateFileToggleSection();
      } else {
        // Create on first demand (initial load path)
        this.setupFileToggleSection();
      }

      // Ensure UI sync loop is running
      this.startUpdateLoop();
    }
  }

  /**
   * Set up the control UI (from PlayerDemo)
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

    // Group 5: Pan Control (L / R) ->
    // TODO: maybe add this back in later
    // const panControl = this.createPanControls();
    // controlsRow.appendChild(panControl);

    // Group 6: Zoom Reset Control
    const zoomResetControl = this.createZoomControls();
    controlsRow.appendChild(zoomResetControl);

    // Group 7: Settings Control
    const settingsControl = this.createSettingsControl();
    controlsRow.appendChild(settingsControl);

    // Add to container
    this.controlsContainer.appendChild(controlsRow);

    // Second row: Time display and seek bar
    const timeDisplay = this.createTimeDisplay();
    this.controlsContainer.appendChild(timeDisplay);

    // Add controls to player container
    this.playerContainer.appendChild(this.controlsContainer);

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
      z-index: 10;
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
    this.updatePlayButton = updatePlayButton;

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
          this.audioPlayer?.setLoopPoints(pointA, pointB);
        } else if (pointA !== null) {
          this.audioPlayer?.setLoopPoints(pointA, null);
        }

        const startPoint = pointA !== null ? pointA : 0;
        this.audioPlayer?.seek(startPoint);
        if (!this.audioPlayer?.getState().isPlaying) {
          this.audioPlayer?.play();
        }
      } else {
        delete btnLoopRestart.dataset.active;
        btnLoopRestart.style.background = "transparent";
        btnLoopRestart.style.color = "#495057";
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
          pointA = state.currentTime;

          if (pointB !== null && pointA > pointB) {
            [pointA, pointB] = [pointB, pointA];
          }

          btnA.style.background = COLOR_A;
          btnA.style.color = "white";
          btnA.style.fontWeight = "800";
          btnA.style.boxShadow = `inset 0 0 0 2px ${COLOR_A}`;
          btnA.dataset.active = "true";

          if (pointB === null) {
            btnB.style.background = "transparent";
            btnB.style.color = "#495057";
            btnB.style.fontWeight = "600";
            btnB.style.boxShadow = "none";
            delete btnB.dataset.active;
          }

          this.updateSeekBar?.();
          this.pianoRollInstance?.setTime?.(pointA);
        }
      },
      false
    );

    // B button
    const btnB = createLoopButton(
      "B",
      () => {
        const state = this.audioPlayer?.getState();
        if (state) {
          if (pointA === null) {
            pointB = state.currentTime;

            btnB.style.background = `${COLOR_B}`;
            btnB.style.color = "white";
            btnB.style.fontWeight = "800";
            btnB.style.boxShadow = "inset 0 0 0 2px #ff7f00";
            btnB.dataset.active = "true";

            btnA.style.background = "transparent";
            btnA.style.color = "#495057";
            btnA.style.fontWeight = "600";
            btnA.style.boxShadow = "none";
            delete btnA.dataset.active;
          } else {
            pointB = state.currentTime;

            if (pointB < pointA) {
              [pointA, pointB] = [pointB, pointA];
            }

            btnB.style.background = `${COLOR_B}`;
            btnB.style.color = "white";
            btnB.style.fontWeight = "800";
            btnB.style.boxShadow = "inset 0 0 0 2px #ff7f00";
            btnB.dataset.active = "true";
          }

          this.updateSeekBar?.();
        }
      },
      false
    );

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
      this.updateSeekBar?.();

      if (isLoopRestartActive) {
        this.audioPlayer?.setLoopPoints(null, null);

        if (wasPlaying) {
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
    this.updateSeekBar = () => {
      const progressBar = this.progressBar;
      const seekBarContainer = this.seekBarContainer;
      if (progressBar && seekBarContainer) {
        const state = this.audioPlayer?.getState();
        if (state && state.duration > 0) {
          if (pointA !== null) {
            let start = pointA;
            let end: number | null = pointB;

            if (end !== null && start > end) {
              [start, end] = [end, start];
            }

            const clampedEnd =
              end !== null ? Math.min(end, state.duration) : null;
            const aPercent = (start / state.duration) * 100;
            const bPercent =
              clampedEnd !== null ? (clampedEnd / state.duration) * 100 : null;
            this.loopPoints = { a: aPercent, b: bPercent };

            if (this.markerATimeLabel)
              this.markerATimeLabel.textContent = this.formatTime(start);
            if (this.markerBTimeLabel && clampedEnd !== null) {
              this.markerBTimeLabel.textContent = this.formatTime(clampedEnd);
            }

            if (isLoopRestartActive) {
              this.audioPlayer?.setLoopPoints?.(start, clampedEnd);
            }

            this.pianoRollInstance?.setLoopWindow?.(start, clampedEnd);
            return;
          }

          if (pointA === null && pointB !== null) {
            const clampedB = Math.min(pointB, state.duration);
            const bPercent = (clampedB / state.duration) * 100;
            this.loopPoints = { a: null, b: bPercent };

            if (this.markerBTimeLabel)
              this.markerBTimeLabel.textContent = this.formatTime(clampedB);

            if (isLoopRestartActive) {
              this.audioPlayer?.setLoopPoints?.(null, clampedB);
            }

            this.pianoRollInstance?.setLoopWindow?.(null, clampedB);
            return;
          }
        }
      }
      this.loopPoints = null;

      this.pianoRollInstance?.setLoopWindow?.(null, null);

      if (isLoopRestartActive) {
        this.audioPlayer?.setLoopPoints?.(null, null);
      }
    };

    container.appendChild(btnLoopRestart);
    container.appendChild(btnA);
    container.appendChild(btnB);
    container.appendChild(btnClear);

    setTimeout(() => {
      this.updateSeekBar?.();
    }, 100);

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
      pointer-events: none;
      position: relative;
      z-index: 3;
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
    this.markerATimeLabel = labelATime;

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
    this.markerBTimeLabel = labelBTime;
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

    // Progress indicator
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
      z-index: 1;
    `;
    this.progressIndicator = progressIndicator;

    seekBarContainer.appendChild(loopRegion);
    seekBarContainer.appendChild(progressBar);
    seekBarContainer.appendChild(markerA);
    seekBarContainer.appendChild(markerB);
    seekBarContainer.appendChild(seekHandle);
    seekBarContainer.appendChild(progressIndicator);

    // Store references
    this.seekBarContainer = seekBarContainer;
    this.loopRegion = loopRegion;
    this.markerA = markerA;
    this.markerB = markerB;

    // Show handle on hover
    seekBarContainer.addEventListener("mouseenter", () => {
      seekHandle.style.opacity = "1";
    });
    seekBarContainer.addEventListener("mouseleave", () => {
      if (!this.seeking) seekHandle.style.opacity = "0";
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
        if (this.progressIndicator)
          this.progressIndicator.style.left = `${percent * 100}%`;
      }
    };

    seekBarContainer.addEventListener("mousedown", (e) => {
      this.seeking = true;
      seekHandle.style.opacity = "1";
      handleSeek(e);

      const handleMove = (e: MouseEvent) => {
        if (this.seeking) handleSeek(e);
      };

      const handleUp = () => {
        this.seeking = false;
        seekHandle.style.opacity = "0";
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    });

    // Store references for updates
    this.progressBar = progressBar;
    this.seekHandle = seekHandle;

    container.appendChild(currentTimeLabel);
    container.appendChild(seekBarContainer);
    container.appendChild(totalTimeLabel);

    // Expose for update loop
    this.currentTimeLabel = currentTimeLabel;
    this.totalTimeLabel = totalTimeLabel;

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

    // Volume icon button
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

    // Slider
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

    // Numeric input
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

      if (safe === 0) {
        iconBtn.style.color = "#dc3545";
      } else if (safe < 30) {
        iconBtn.style.color = "#ffc107";
      } else {
        iconBtn.style.color = "#495057";
      }
    };

    const updateVolume = (percent: number) => {
      const vol = clampPercent(percent) / 100;
      this.audioPlayer?.setVolume(vol);

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

    // Numeric input change
    const handleInputChange = () => {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        isMuted = false;
        updateVolume(val);
      }
    };
    input.addEventListener("input", handleInputChange);
    input.addEventListener("blur", handleInputChange);

    // Wheel scroll
    container.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 1 : -1;
      const newVal = clampPercent(parseFloat(slider.value) + delta);
      isMuted = false;
      updateVolume(newVal);
    });

    // Keyboard shortcuts
    if (!(window as any)._multiMidiVolumeKeyHandlerAttached) {
      (window as any)._multiMidiVolumeKeyHandlerAttached = true;
      window.addEventListener("keydown", (e) => {
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

    const tempo = this.audioPlayer?.getState().tempo || 120;
    const initialTempo = tempo.toFixed(2);

    // Number input
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
    `;

    const label = document.createElement("span");
    label.textContent = "BPM";
    label.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

    const clampTempo = (v: number) => Math.max(40, Math.min(400, v));
    const updateTempo = (value: number) => {
      let tempoVal = clampTempo(parseFloat(value.toFixed(2)));
      input.value = tempoVal.toString();
      this.audioPlayer?.setTempo(tempoVal);
    };

    input.addEventListener("input", () => {
      updateTempo(parseFloat(input.value) || 120);
    });

    input.addEventListener("focus", () => {
      input.style.background = "rgba(0, 123, 255, 0.15)";
      input.style.boxShadow = "0 0 0 3px rgba(0, 123, 255, 0.1)";
    });

    input.addEventListener("blur", () => {
      input.style.background = "rgba(0, 123, 255, 0.08)";
      input.style.boxShadow = "none";
      updateTempo(parseFloat(input.value) || 120);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
      }
    });

    container.appendChild(input);
    container.appendChild(label);

    return container;
  }

  /**
   * Create stereo pan control (L / R) buttons
   */
  private createPanControls(): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      height: 48px;
      background: rgba(255, 255, 255, 0.8);
      padding: 4px;
      border-radius: 8px;
    `;

    const makeBtn = (label: string, panVal: number): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.style.cssText = `
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #495057;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        transition: all 0.15s ease;
      `;

      const updateActiveStyle = () => {
        const currentPan = this.audioPlayer?.getState().pan ?? 0;
        if (Math.abs(currentPan - panVal) < 0.01) {
          btn.style.background = "rgba(0, 123, 255, 0.1)";
          btn.style.color = COLOR_PRIMARY;
          btn.dataset.active = "true";
        } else {
          btn.style.background = "transparent";
          btn.style.color = "#495057";
          delete btn.dataset.active;
        }
      };

      btn.addEventListener("click", () => {
        this.audioPlayer?.setPan(panVal);
        // Refresh both buttons' styles
        updateLeft();
        updateRight();
      });

      return btn;
    };

    // Create buttons
    let leftBtnObj: any;
    let rightBtnObj: any;

    // Track global L/R button states (true = active)
    let leftGlobalActive = true;
    let rightGlobalActive = true;

    const updateGlobalPan = () => {
      let panVal = 0;
      const bothOff = !leftGlobalActive && !rightGlobalActive;

      if (leftGlobalActive && !rightGlobalActive) panVal = -1;
      else if (!leftGlobalActive && rightGlobalActive) panVal = 1;

      // Propagate pan changes to audio player and per-file controls
      if (bothOff) {
        // No active channel → mute per-file L/R buttons as well
        this.applyPanToVisibleFiles(null);
      } else {
        this.audioPlayer?.setPan(panVal);
        this.applyPanToVisibleFiles(panVal);
      }

      // Handle mute/unmute based on global state
      this.updateMuteState(bothOff);

      // Refresh per-button visuals
      leftBtnObj.updateActiveStyle();
      rightBtnObj.updateActiveStyle();
    };

    const makeLeft = () => {
      const obj: any = {};
      obj.btn = document.createElement("button");
      obj.btn.textContent = "L";
      obj.btn.style.cssText = `
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #495057;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        transition: all 0.15s ease;
      `;
      obj.updateActiveStyle = () => {
        if (leftGlobalActive) {
          obj.btn.style.background = "rgba(40, 167, 69, 0.1)";
          obj.btn.style.color = "#28a745";
        } else {
          obj.btn.style.background = "transparent";
          obj.btn.style.color = "#495057";
        }
      };
      obj.btn.addEventListener("click", () => {
        leftGlobalActive = !leftGlobalActive;
        // If both turned off we do NOT automatically enable right.
        updateGlobalPan();
      });
      return obj;
    };

    const makeRight = () => {
      const obj: any = {};
      obj.btn = document.createElement("button");
      obj.btn.textContent = "R";
      obj.btn.style.cssText = `
        width: 28px;
        height: 28px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #495057;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        transition: all 0.15s ease;
      `;
      obj.updateActiveStyle = () => {
        if (rightGlobalActive) {
          obj.btn.style.background = "rgba(220, 53, 69, 0.1)";
          obj.btn.style.color = "#dc3545";
        } else {
          obj.btn.style.background = "transparent";
          obj.btn.style.color = "#495057";
        }
      };
      obj.btn.addEventListener("click", () => {
        rightGlobalActive = !rightGlobalActive;
        updateGlobalPan();
      });
      return obj;
    };

    leftBtnObj = makeLeft();
    rightBtnObj = makeRight();

    const updateLeft = leftBtnObj.updateActiveStyle;
    const updateRight = rightBtnObj.updateActiveStyle;

    // Initial state sync
    updateGlobalPan();

    container.appendChild(leftBtnObj.btn);
    container.appendChild(rightBtnObj.btn);

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

    // Zoom-X input
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
      color: #20c997;
      background: #ffffff;
    `;

    const clampZoom = (v: number) => Math.max(0.1, Math.min(10, v));

    const applyZoom = () => {
      const numericVal = parseFloat(zoomInput.value);
      if (isNaN(numericVal)) {
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

    zoomInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        applyZoom();
        zoomInput.blur();
      }
    });

    zoomInput.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      const numeric = parseFloat(zoomInput.value) || currentZoom;
      zoomInput.value = (numeric + delta).toFixed(1);
      applyZoom();
    });

    const zoomSuffix = document.createElement("span");
    zoomSuffix.textContent = "x";
    zoomSuffix.style.cssText = `
      font-size: 12px;
      font-weight: 600;
      color: #6c757d;
    `;

    // Reset view button
    const resetBtn = this.createIconButton(PLAYER_ICONS.zoom_reset, () => {
      this.pianoRollInstance?.resetView();
      zoomInput.value = "1.0";
    });

    resetBtn.title = "Reset Zoom/Pan";

    container.appendChild(zoomInput);
    container.appendChild(zoomSuffix);
    container.appendChild(resetBtn);

    this.zoomInput = zoomInput;

    return container;
  }

  private createSettingsControl(): HTMLElement {
    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      align-items: center;
    `;

    // Settings button
    const settingsBtn = this.createIconButton(PLAYER_ICONS.settings, () => {
      if (document.getElementById("zoom-settings-overlay")) return;

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

      // Time-step input group
      const stepInputGroup = document.createElement("div");
      stepInputGroup.style.cssText = `
        display: flex;
        align-items: center;
        gap: 4px;
      `;

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

      // Minor time-step input group (sub grid)
      const minorGroup = document.createElement("div");
      minorGroup.style.cssText = `
        display: flex;
        align-items: center;
        gap: 4px;
      `;

      const minorInput = document.createElement("input");
      const currentMinor =
        this.pianoRollInstance?.getMinorTimeStep?.() ?? this.minorTimeStep;
      minorInput.type = "number";
      minorInput.min = "0.05";
      minorInput.step = "0.05";
      minorInput.value = currentMinor.toString();
      minorInput.style.cssText = `
        width: 64px;
        padding: 4px 6px;
        border: 1px solid #ced4da;
        border-radius: 6px;
        font-size: 12px;
        text-align: center;
        color: #28a745;
        background: #ffffff;
      `;

      const applyMinor = () => {
        const val = parseFloat(minorInput.value);
        if (!isNaN(val) && val > 0) {
          this.minorTimeStep = val;
          this.pianoRollInstance?.setMinorTimeStep?.(val);
        }
      };
      minorInput.addEventListener("change", applyMinor);
      minorInput.addEventListener("blur", applyMinor);

      const minorLabel = document.createElement("label");
      minorLabel.textContent = "Minor step:";
      minorLabel.style.cssText = `
        font-size: 12px;
        font-weight: 600;
        color: #6c757d;
      `;

      const minorSuffix = document.createElement("span");
      minorSuffix.textContent = "s";
      minorSuffix.style.cssText = `
        font-size: 12px;
        font-weight: 600;
        color: #6c757d;
      `;

      minorGroup.appendChild(minorLabel);
      minorGroup.appendChild(minorInput);
      minorGroup.appendChild(minorSuffix);

      modal.appendChild(header);
      modal.appendChild(stepInputGroup);
      modal.appendChild(minorGroup);

      overlay.appendChild(modal);

      // Click outside to close
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
    // Clear any existing loop to avoid duplicates
    if (this.updateLoopId !== null) {
      clearInterval(this.updateLoopId);
    }

    this.updateLoopId = window.setInterval(() => {
      if (!this.audioPlayer) {
        if (this.updateLoopId !== null) {
          clearInterval(this.updateLoopId);
          this.updateLoopId = null;
        }
        return;
      }

      const state = this.audioPlayer.getState();

      // Update time display
      const current = this.formatTime(state.currentTime);
      const total = this.formatTime(state.duration);
      if (this.currentTimeLabel) this.currentTimeLabel.textContent = current;
      if (this.totalTimeLabel) this.totalTimeLabel.textContent = total;

      // Update seek bar if not actively seeking
      if (this.progressBar && !this.seeking) {
        const progress =
          state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
        this.progressBar.style.width = `${progress}%`;
        if (this.seekHandle) this.seekHandle.style.left = `${progress}%`;
        if (this.progressIndicator)
          this.progressIndicator.style.left = `${progress}%`;
      }

      // Update A-B loop display
      if (this.loopPoints && this.loopRegion && this.markerA && this.markerB) {
        if (this.loopPoints.a !== null) {
          this.markerA.style.display = "block";
          this.markerA.style.left = `${this.loopPoints.a}%`;
        } else {
          this.markerA.style.display = "none";
        }

        if (this.loopPoints.b !== null) {
          this.markerB.style.display = "block";
          this.markerB.style.left = `${this.loopPoints.b}%`;
        } else {
          this.markerB.style.display = "none";
        }

        if (this.loopPoints.a !== null && this.loopPoints.b !== null) {
          this.loopRegion.style.display = "block";
          this.loopRegion.style.left = `${this.loopPoints.a}%`;
          this.loopRegion.style.width = `${this.loopPoints.b - this.loopPoints.a}%`;
        } else {
          this.loopRegion.style.display = "none";
        }
      } else if (this.loopRegion && this.markerA && this.markerB) {
        this.loopRegion.style.display = "none";
        this.markerA.style.display = "none";
        this.markerB.style.display = "none";
      }

      // Update play button state
      if (this.updatePlayButton) {
        this.updatePlayButton();
      }

      // Keep zoomInput in sync
      if (this.zoomInput && document.activeElement !== this.zoomInput) {
        const zoomState = this.pianoRollInstance?.getState?.().zoomX;
        if (zoomState !== undefined) {
          const formatted = zoomState.toFixed(1);
          if (this.zoomInput.value !== formatted) {
            this.zoomInput.value = formatted;
          }
        }
      }
    }, 100);
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
   * Create player controls (deprecated - use setupUI instead)
   */
  private createPlayerControls(): void {
    // This method is now replaced by setupUI
    this.setupUI();
  }

  /**
   * Open settings modal
   */
  private openSettingsModal(): void {
    // Prevent multiple modals
    if (document.getElementById("multi-midi-settings-modal")) return;

    // Create overlay
    const overlay = document.createElement("div");
    overlay.id = "multi-midi-settings-modal";
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

    // Create modal
    const modal = document.createElement("div");
    modal.style.cssText = `
      background: white;
      border-radius: 12px;
      width: 600px;
      max-width: 90%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    `;

    // Header
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 20px 24px;
      border-bottom: 1px solid #dee2e6;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const title = document.createElement("h2");
    title.textContent = "MIDI Settings";
    title.style.cssText = `
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #343a40;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText = `
      border: none;
      background: transparent;
      font-size: 24px;
      cursor: pointer;
      color: #6c757d;
    `;

    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.background = "#f8f9fa";
    });

    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.background = "transparent";
    });

    closeBtn.onclick = () => overlay.remove();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Content
    const content = document.createElement("div");
    content.style.cssText = `
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    `;

    // File management section
    const fileSection = document.createElement("div");
    fileSection.innerHTML = `
      <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #495057;">
        MIDI Files
      </h3>
    `;

    const fileListSettings = document.createElement("div");
    fileListSettings.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    `;

    // Add file list items with edit capabilities
    const state = this.midiManager.getState();
    state.files.forEach((file) => {
      const fileSettingItem = this.createFileSettingItem(file);
      fileListSettings.appendChild(fileSettingItem);
    });

    fileSection.appendChild(fileListSettings);

    // Add file button
    const addFileBtn = document.createElement("button");
    addFileBtn.textContent = "+ Add MIDI File";
    addFileBtn.style.cssText = `
      width: 100%;
      padding: 12px;
      border: 2px dashed #dee2e6;
      border-radius: 8px;
      background: transparent;
      color: #0984e3;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      margin-bottom: 32px;
    `;

    addFileBtn.addEventListener("mouseenter", () => {
      addFileBtn.style.borderColor = "#0984e3";
      addFileBtn.style.background = "rgba(9, 132, 227, 0.05)";
    });

    addFileBtn.addEventListener("mouseleave", () => {
      addFileBtn.style.borderColor = "#dee2e6";
      addFileBtn.style.background = "transparent";
    });

    addFileBtn.addEventListener("click", () => {
      // Create file input
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".mid,.midi";
      fileInput.multiple = true;

      fileInput.addEventListener("change", async (e) => {
        const files = (e.target as HTMLInputElement).files;
        if (files) {
          const fileArray = Array.from(files);
          for (const file of fileArray) {
            try {
              const parsedData = await parseMidi(file);
              this.midiManager.addMidiFile(file.name, parsedData);
              // Refresh modal
              overlay.remove();
              this.openSettingsModal();
            } catch (error) {
              console.error(`Failed to load ${file.name}:`, error);
              alert(`Failed to load ${file.name}`);
            }
          }
        }
      });

      fileInput.click();
    });

    fileSection.appendChild(addFileBtn);

    // Palette section
    const paletteSection = document.createElement("div");
    paletteSection.innerHTML = `
      <h3 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #495057;">
        Color Palette
      </h3>
    `;

    const paletteGrid = document.createElement("div");
    paletteGrid.style.cssText = `
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 12px;
    `;

    // Add palette options
    DEFAULT_PALETTES.forEach((palette) => {
      const paletteOption = this.createPaletteOption(palette);
      paletteGrid.appendChild(paletteOption);
    });

    paletteSection.appendChild(paletteGrid);

    // Assemble content
    content.appendChild(fileSection);
    content.appendChild(paletteSection);

    // Assemble modal
    modal.appendChild(header);
    modal.appendChild(content);
    overlay.appendChild(modal);

    // Click outside to close
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  /**
   * Create file setting item for modal (restored)
   */
  private createFileSettingItem(file: MidiFileEntry): HTMLElement {
    const item = document.createElement("div");
    item.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: #f8f9fa;
      border-radius: 8px;
    `;

    // Color picker
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.value = `#${file.color.toString(16).padStart(6, "0")}`;
    colorPicker.style.cssText = `
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;

    colorPicker.addEventListener("change", (e) => {
      const hexColor = (e.target as HTMLInputElement).value;
      const numColor = parseInt(hexColor.substring(1), 16);
      this.midiManager.updateColor(file.id, numColor);
    });

    // Name input
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = file.displayName;
    nameInput.style.cssText = `
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #dee2e6;
      border-radius: 6px;
      font-size: 14px;
      background: white;
    `;

    nameInput.addEventListener("change", (e) => {
      this.midiManager.updateDisplayName(
        file.id,
        (e.target as HTMLInputElement).value
      );
    });

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      background: #dc3545;
      color: white;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    `;

    deleteBtn.addEventListener("mouseenter", () => {
      deleteBtn.style.background = "#c82333";
    });

    deleteBtn.addEventListener("mouseleave", () => {
      deleteBtn.style.background = "#dc3545";
    });

    deleteBtn.addEventListener("click", () => {
      if (confirm(`Delete "${file.displayName}"?`)) {
        this.midiManager.removeMidiFile(file.id);
        item.remove();
      }
    });

    item.appendChild(colorPicker);
    item.appendChild(nameInput);
    item.appendChild(deleteBtn);

    return item;
  }

  /**
   * Create palette option for modal (restored)
   */
  private createPaletteOption(palette: any): HTMLElement {
    const option = document.createElement("div");
    option.style.cssText = `
      padding: 12px;
      border: 2px solid #dee2e6;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
    `;

    const isActive = this.midiManager.getState().activePaletteId === palette.id;
    if (isActive) {
      option.style.borderColor = "#0984e3";
      option.style.background = "rgba(9, 132, 227, 0.05)";
    }

    // Palette name
    const name = document.createElement("div");
    name.textContent = palette.name;
    name.style.cssText = `
      font-size: 14px;
      font-weight: 500;
      color: #343a40;
      margin-bottom: 8px;
    `;

    // Color preview
    const colorPreview = document.createElement("div");
    colorPreview.style.cssText = `
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    `;

    palette.colors.slice(0, 6).forEach((color: number) => {
      const colorDot = document.createElement("div");
      colorDot.style.cssText = `
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #${color.toString(16).padStart(6, "0")};
      `;
      colorPreview.appendChild(colorDot);
    });

    option.appendChild(name);
    option.appendChild(colorPreview);

    // Click handler
    option.addEventListener("click", () => {
      this.midiManager.setActivePalette(palette.id);
      // Refresh modal
      const overlay = document.getElementById("multi-midi-settings-modal");
      if (overlay) {
        overlay.remove();
        this.openSettingsModal();
      }
    });

    // Hover effect
    if (!isActive) {
      option.addEventListener("mouseenter", () => {
        option.style.borderColor = "#0984e3";
        option.style.background = "rgba(9, 132, 227, 0.02)";
      });

      option.addEventListener("mouseleave", () => {
        option.style.borderColor = "#dee2e6";
        option.style.background = "transparent";
      });
    }

    return option;
  }

  /** Destroy the demo (restored) */
  public destroy(): void {
    // Clear UI sync interval
    if (this.updateLoopId !== null) {
      clearInterval(this.updateLoopId);
      this.updateLoopId = null;
    }
    if (this.playerDemo) {
      this.playerDemo.destroy();
      this.playerDemo = null;
    }

    if (this.pianoRollInstance) {
      this.pianoRollInstance.destroy();
      this.pianoRollInstance = null;
    }

    if (this.audioPlayer) {
      this.audioPlayer.destroy();
      this.audioPlayer = null;
    }

    this.midiManager.clearAll();
    this.container.innerHTML = "";
  }

  /**
   * Create (or ensure) the container that holds visibility checkboxes beneath
   * the player controls, and populate it with the current MIDI file list.
   */
  private setupFileToggleSection(): void {
    if (this.fileToggleContainer) return; // already created in this render cycle

    const container = document.createElement("div");
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
      align-items: stretch;
      width: 100%;
    `;

    this.fileToggleContainer = container;
    this.playerContainer.appendChild(container);

    this.updateFileToggleSection();
  }

  /**
   * Refresh the file-toggle checkboxes to reflect current visibility/state.
   */
  private updateFileToggleSection(): void {
    if (!this.fileToggleContainer) return;

    this.fileToggleContainer.innerHTML = "";

    // Reset per-file pan handlers
    this.filePanStateHandlers = {};

    const state = this.midiManager.getState();

    if (state.files.length === 0) {
      const emptyMsg = document.createElement("span");
      emptyMsg.textContent = "No MIDI files loaded";
      emptyMsg.style.cssText = `
        color: #6c757d;
        font-size: 14px;
      `;
      this.fileToggleContainer.appendChild(emptyMsg);
      return;
    }

    state.files.forEach((file) => {
      const label = document.createElement("label");
      label.style.cssText = `
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        user-select: none;
        justify-content: flex-start;
        width: 100%;
      `;

      // Visibility toggle
      const visBtn = document.createElement("button");
      const isVisibleToggle = file.isVisible;
      visBtn.innerHTML = isVisibleToggle
        ? PLAYER_ICONS.eye_open
        : PLAYER_ICONS.eye_closed;
      visBtn.style.cssText = `
        width: 18px;
        height: 18px;
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: ${isVisibleToggle ? "#495057" : "#adb5bd"};
        transition: color 0.15s ease;
      `;
      visBtn.addEventListener("click", () => {
        this.midiManager.toggleVisibility(file.id);
      });

      const colorDot = document.createElement("div");
      colorDot.style.cssText = `
        width: 12px;
        height: 12px;
        border-radius: 3px;
        background: #${file.color.toString(16).padStart(6, "0")};
        flex-shrink: 0;
      `;

      const nameSpan = document.createElement("span");
      nameSpan.textContent = file.displayName;
      nameSpan.style.cssText = `
        color: ${file.isVisible ? "#343a40" : "#6c757d"};
      `;

      label.appendChild(visBtn);
      label.appendChild(colorDot);
      label.appendChild(nameSpan);

      // Pan slider [L] —— [R]
      const panContainer = document.createElement("div");
      panContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 4px;
        margin-left: auto;
      `;

      const leftLabel = document.createElement("span");
      leftLabel.textContent = "L";
      leftLabel.style.cssText = `
        font-size: 10px;
        font-weight: 700;
        color: #495057;
      `;

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = "-1";
      slider.max = "1";
      slider.step = "0.1";
      const initialPan = this.filePanValues[file.id] ?? 0;
      slider.value = initialPan.toString();
      slider.style.cssText = `
        width: 70px;
        cursor: pointer;
      `;

      const rightLabel = document.createElement("span");
      rightLabel.textContent = "R";
      rightLabel.style.cssText = `
        font-size: 10px;
        font-weight: 700;
        color: #495057;
      `;

      const applyPan = (val: number) => {
        this.audioPlayer?.setPan(val);
        this.filePanValues[file.id] = val;
        this.updateMuteState(false);
      };

      // User-driven change
      slider.addEventListener("input", () => {
        applyPan(parseFloat(slider.value));
      });

      panContainer.appendChild(leftLabel);
      panContainer.appendChild(slider);
      panContainer.appendChild(rightLabel);

      label.appendChild(panContainer);

      // Handler for global controls → update this slider
      this.filePanStateHandlers[file.id] = (panVal: number | null) => {
        const v = panVal ?? 0;
        slider.value = v.toString();
      };

      // Persist current pan
      this.filePanValues[file.id] = initialPan;

      this.fileToggleContainer!.appendChild(label);
    });
  }

  /**
   * Propagate a pan change from the global L/R buttons to every *visible* file's
   * individual L/R toggle buttons.
   * @param pan  -1 for Left, 1 for Right, 0 (or any other) for Center (L+R).
   */
  private applyPanToVisibleFiles(pan: number | null): void {
    const state = this.midiManager.getState();
    state.files.forEach((file) => {
      if (!file.isVisible) return;
      const handler = this.filePanStateHandlers[file.id];
      if (handler) handler(pan);
      this.filePanValues[file.id] = pan ?? 0;
    });
  }

  /**
   * Mute or restore audio output depending on channel activity.
   * @param shouldMute - If true, mute audio; otherwise restore previous volume.
   */
  private updateMuteState(shouldMute: boolean): void {
    if (!this.audioPlayer) return;
    if (shouldMute) {
      if (!this.muteDueNoLR) {
        this.lastVolumeBeforeMute = this.audioPlayer.getState().volume;
        this.audioPlayer.setVolume(0);
        this.muteDueNoLR = true;
      }
    } else if (this.muteDueNoLR) {
      this.audioPlayer.setVolume(this.lastVolumeBeforeMute);
      this.muteDueNoLR = false;
    }
  }
}

/** Factory function to create multi MIDI demo (restored) */
export async function createMultiMidiDemo(
  container: HTMLElement,
  files: Array<{ path: string; displayName?: string }> = []
): Promise<MultiMidiDemo> {
  const demo = new MultiMidiDemo(container, files);
  await demo.initialize();
  return demo;
}
