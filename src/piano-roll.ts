/**
 * PixiJS-based Piano Roll Visualizer
 *
 * High-performance piano roll component that renders MIDI notes as rectangles
 * on a canvas with zoom, pan, and playback synchronization capabilities.
 */

import * as PIXI from "pixi.js";
import { scaleLinear } from "d3-scale";
import { NoteData } from "./types";

/**
 * Configuration options for the piano roll
 */
export interface PianoRollOptions {
  /** Container width in pixels */
  width?: number;
  /** Container height in pixels */
  height?: number;
  /** Background color as hex number */
  backgroundColor?: number;
  /** Note color as hex number */
  noteColor?: number;
  /** Current playback position color */
  playheadColor?: number;
  /** Whether to show piano key labels on the left */
  showPianoKeys?: boolean;
  /** MIDI note range to display */
  noteRange?: { min: number; max: number };
}

/**
 * Piano roll component state
 */
interface PianoRollState {
  /** Current zoom level on X axis (time) */
  zoomX: number;
  /** Current zoom level on Y axis (pitch) */
  zoomY: number;
  /** Pan offset on X axis (time) */
  panX: number;
  /** Pan offset on Y axis (pitch) - FIXED at 0 */
  panY: number;
  /** Current playback time in seconds */
  currentTime: number;
  /** Whether panning is active */
  isPanning: boolean;
  /** Last mouse/touch position for panning */
  lastPointerPos: { x: number; y: number };
  /** Maximum pan offset on X axis (time) */
  maxPanX: number;
}

/**
 * Piano roll visualizer using PixiJS for high-performance rendering
 */
export class PianoRoll {
  private app: PIXI.Application;
  private container!: PIXI.Container;
  private notesContainer!: PIXI.Container;
  private playheadLine!: PIXI.Graphics;
  private backgroundGrid!: PIXI.Graphics;

  private playheadX: number = 0;
  private notes: NoteData[] = [];
  private noteGraphics: PIXI.Graphics[] = [];
  private state: PianoRollState;
  private options: Required<PianoRollOptions>;

  // Scales for coordinate transformation
  private timeScale: any;
  private pitchScale: any;

  // Performance optimization
  private lastRenderTime = 0;
  private renderThrottleMs = 16; // ~60fps

  private constructor(
    canvas: HTMLCanvasElement,
    options: PianoRollOptions = {}
  ) {
    // Set default options
    this.options = {
      width: 800,
      height: 400,
      backgroundColor: 0xffffff,
      noteColor: 0x4285f4,
      playheadColor: 0xff4444,
      showPianoKeys: true,
      noteRange: { min: 21, max: 108 }, // A0 to C8
      ...options,
    };

    // Initialize state
    this.state = {
      zoomX: 1,
      zoomY: 1,
      panX: 0,
      panY: 0, // Always 0 - no vertical panning
      currentTime: 0,
      isPanning: false,
      lastPointerPos: { x: 0, y: 0 },
      maxPanX: 0,
    };

    // Initialize PixiJS application
    this.app = new PIXI.Application();
  }

  /**
   * Static factory method to create PianoRoll instance
   */
  public static async create(
    canvas: HTMLCanvasElement,
    options: PianoRollOptions = {}
  ): Promise<PianoRoll> {
    const instance = new PianoRoll(canvas, options);
    await instance.initializeApp(canvas);
    instance.initializeContainers();
    instance.initializeScales();
    instance.setupInteraction();
    instance.render(); // Full render including playhead
    return instance;
  }

  /**
   * Initialize PixiJS application with canvas
   */
  private async initializeApp(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      width: this.options.width,
      height: this.options.height,
      backgroundColor: this.options.backgroundColor,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
  }

  /**
   * Initialize container hierarchy for organized rendering
   */
  private initializeContainers(): void {
    // Main container for all elements
    this.container = new PIXI.Container();
    this.container.sortableChildren = true; // Enable z-index sorting
    this.app.stage.addChild(this.container);

    // Background grid container
    this.backgroundGrid = new PIXI.Graphics();
    this.backgroundGrid.zIndex = 1;
    this.container.addChild(this.backgroundGrid);

    // Notes container for all note rectangles
    this.notesContainer = new PIXI.Container();
    this.notesContainer.zIndex = 10;
    this.container.addChild(this.notesContainer);

    // Playhead line (always on top)
    this.playheadLine = new PIXI.Graphics();
    this.playheadLine.zIndex = 1000;
    this.container.addChild(this.playheadLine);
  }

  /**
   * Initialize coordinate scales for time and pitch
   */
  private initializeScales(): void {
    const maxTime =
      this.notes.length > 0
        ? Math.max(...this.notes.map((n) => n.time + n.duration))
        : 60; // Default 60 seconds if no notes

    this.timeScale = scaleLinear()
      .domain([0, maxTime])
      .range([0, this.options.width - (this.options.showPianoKeys ? 60 : 0)]);

    this.pitchScale = scaleLinear()
      .domain([this.options.noteRange.min, this.options.noteRange.max])
      .range([this.options.height - 20, 20]); // Leave margin at top/bottom

    this.state.maxPanX = this.timeScale.range()[1] - this.options.width;
  }

  /**
   * Set up mouse/touch interaction for panning and zooming
   */
  private setupInteraction(): void {
    const canvas = this.app.canvas;

    // Mouse/touch events for panning
    canvas.addEventListener("mousedown", this.onPointerDown.bind(this));
    canvas.addEventListener("mousemove", this.onPointerMove.bind(this));
    canvas.addEventListener("mouseup", this.onPointerUp.bind(this));
    canvas.addEventListener("mouseleave", this.onPointerUp.bind(this));

    // Touch events
    canvas.addEventListener("touchstart", this.onPointerDown.bind(this));
    canvas.addEventListener("touchmove", this.onPointerMove.bind(this));
    canvas.addEventListener("touchend", this.onPointerUp.bind(this));

    // Wheel event for zooming
    canvas.addEventListener("wheel", this.onWheel.bind(this));

    // Prevent default touch behaviors
    canvas.style.touchAction = "none";
  }

  /**
   * Handle pointer down events (mouse/touch)
   */
  private onPointerDown(event: MouseEvent | TouchEvent): void {
    event.preventDefault();

    const pos = this.getPointerPosition(event);
    this.state.isPanning = true;
    this.state.lastPointerPos = pos;
  }

  /**
   * Handle pointer move events for panning
   */
  private onPointerMove(event: MouseEvent | TouchEvent): void {
    if (!this.state.isPanning) return;

    event.preventDefault();
    const pos = this.getPointerPosition(event);
    const deltaX = pos.x - this.state.lastPointerPos.x;
    // const deltaY = pos.y - this.state.lastPointerPos.y; // Remove Y-axis panning

    this.state.panX += deltaX;
    this.clampPanX();
    this.state.lastPointerPos = pos;

    this.requestRender();
  }

  /**
   * Handle pointer up events
   */
  private onPointerUp(event: MouseEvent | TouchEvent): void {
    this.state.isPanning = false;
  }

  /**
   * Handle wheel events for zooming
   */
  private onWheel(event: WheelEvent): void {
    event.preventDefault();

    const zoomFactor = 1.1;
    const deltaY = event.deltaY;

    // if (event.ctrlKey || event.metaKey) {
    //   // Zoom Y (pitch) when holding Ctrl/Cmd - DISABLED
    //   if (deltaY < 0) {
    //     this.state.zoomY *= zoomFactor;
    //   } else {
    //     this.state.zoomY /= zoomFactor;
    //   }
    // } else {
    // Zoom X (time) by default
    if (deltaY < 0) {
      this.state.zoomX *= zoomFactor;
    } else {
      this.state.zoomX /= zoomFactor;
    }
    // }

    // Clamp zoom levels
    this.state.zoomX = Math.max(0.1, Math.min(10, this.state.zoomX));
    // this.state.zoomY = Math.max(0.1, Math.min(5, this.state.zoomY)); // Y zoom disabled

    this.requestRender();
  }

  /**
   * Get normalized pointer position from mouse/touch event
   */
  private getPointerPosition(event: MouseEvent | TouchEvent): {
    x: number;
    y: number;
  } {
    const canvas = this.app.canvas;
    const rect = canvas.getBoundingClientRect();

    let clientX: number, clientY: number;

    if (event instanceof TouchEvent && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      return { x: 0, y: 0 };
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  /**
   * Render background grid and piano keys
   */
  private renderBackground(): void {
    // TODO:I Think it could be dependent on the zoom level
    this.backgroundGrid.clear();

    // Piano key background (if enabled)
    if (this.options.showPianoKeys) {
      // const pianoKeysWidth = this.timeScale(1) * this.state.zoomX;
      const pianoKeysWidth = this.playheadX;
      this.backgroundGrid.rect(0, 0, pianoKeysWidth, this.options.height);
      this.backgroundGrid.fill({ color: 0xf0f0f0 });

      // Draw piano key lines
      for (
        let midi = this.options.noteRange.min;
        midi <= this.options.noteRange.max;
        midi++
      ) {
        const y = this.pitchScale(midi); // * this.state.zoomY + this.state.panY; // No Y zoom/pan
        // const isBlackKey = [1, 3, 6, 8, 10].includes(midi % 12);

        this.backgroundGrid.moveTo(0, y);
        this.backgroundGrid.lineTo(pianoKeysWidth, y);
        this.backgroundGrid.stroke({
          width: 1,
          color: 0xcccccc,
          // color: isBlackKey ? 0x000000 : 0xcccccc,
          alpha: 0.3,
        });
      }
    }

    // Time grid lines
    const timeStep = 1; // 1 second intervals
    const maxTime = this.timeScale.domain()[1];

    for (let t = 0; t <= maxTime; t += timeStep) {
      const x =
        this.timeScale(t) * this.state.zoomX +
        this.state.panX +
        (this.options.showPianoKeys ? 60 : 0);
      this.backgroundGrid.moveTo(x, 0);
      this.backgroundGrid.lineTo(x, this.options.height);
      this.backgroundGrid.stroke({ width: 1, color: 0xe0e0e0, alpha: 0.5 });
    }
  }

  /**
   * Render all note rectangles
   */
  private renderNotes(): void {
    // Clear existing note graphics
    this.noteGraphics.forEach((graphic) => {
      this.notesContainer.removeChild(graphic);
      graphic.destroy();
    });
    this.noteGraphics = [];

    // Calculate viewport boundaries considering piano keys offset
    const pianoKeysOffset = this.options.showPianoKeys ? 60 : 0;

    // Adjusted viewport calculation to account for piano keys
    const viewportTimeStart =
      -(this.state.panX + pianoKeysOffset) /
      (this.timeScale(1) * this.state.zoomX);
    const viewportTimeEnd =
      viewportTimeStart +
      this.options.width / (this.timeScale(1) * this.state.zoomX);

    // console.debug("[viewport]", {
    //   viewportTimeStart,
    //   viewportTimeEnd,
    //   panX: this.state.panX,
    //   zoomX: this.state.zoomX,
    // });

    for (const note of this.notes) {
      // Skip notes outside viewport (only check time, not pitch)
      if (
        note.time + note.duration < viewportTimeStart ||
        note.time > viewportTimeEnd
      ) {
        continue;
      }

      const x =
        this.timeScale(note.time) * this.state.zoomX +
        this.state.panX +
        pianoKeysOffset;
      const y = this.pitchScale(note.midi); // No Y zoom/pan
      const width = this.timeScale(note.duration) * this.state.zoomX;

      // Fixed note height calculation: no Y zoom
      const noteRange = this.options.noteRange.max - this.options.noteRange.min;
      const baseRowHeight = (this.options.height - 40) / noteRange; // Base height per semitone
      const height = Math.max(1, baseRowHeight * 0.8); // 80% of row for spacing, no zoom

      const noteGraphic = new PIXI.Graphics();

      // Note color based on velocity
      const alpha = 0.3 + note.velocity * 0.7; // Scale alpha based on velocity

      // Draw filled rectangle
      noteGraphic.rect(x, y - height / 2, width, height);
      noteGraphic.fill({ color: this.options.noteColor, alpha: alpha });

      // Note border
      noteGraphic.rect(x, y - height / 2, width, height);
      noteGraphic.stroke({
        width: 1,
        color: this.options.noteColor,
        alpha: 0.8,
      });

      this.notesContainer.addChild(noteGraphic);
      this.noteGraphics.push(noteGraphic);
    }
  }

  /**
   * Render playhead line
   */
  private renderPlayhead(): void {
    this.playheadLine.clear();

    const pianoKeysOffset = this.options.showPianoKeys ? 60 : 0;
    const pxPerSecond = this.timeScale(1) * this.state.zoomX;
    const timeOffsetPx = this.state.currentTime * pxPerSecond;

    // Calculate playhead position based on current phase
    // const playheadX = timeOffsetPx + pianoKeysOffset;
    const playheadX = pianoKeysOffset;
    this.playheadX = playheadX;

    // Draw a thicker, more visible red line
    this.playheadLine.moveTo(playheadX, 0);
    this.playheadLine.lineTo(playheadX, this.options.height);
    this.playheadLine.stroke({ width: 3, color: 0xff0000, alpha: 0.7 }); // Red color, full opacity, 3px width

    // Ensure playhead is visible and on top
    this.playheadLine.visible = true;
    this.playheadLine.zIndex = 1000;

    // Force container to re-sort children by zIndex
    this.container.sortChildren();

    // console.debug("[playhead]", {
    //   x: playheadX,
    //   phase: timeOffsetPx <= playheadFixedPosition ? "moving" : "fixed",
    //   height: this.options.height,
    //   currentTime: this.state.currentTime,
    //   visible: this.playheadLine.visible,
    //   color: "0xff0000",
    // });
  }

  /**
   * Request render with throttling for performance
   */
  private requestRender(): void {
    const now = performance.now();
    if (now - this.lastRenderTime < this.renderThrottleMs) {
      return;
    }

    this.lastRenderTime = now;
    this.render();
  }

  /**
   * Full render of all components
   */
  private render(): void {
    this.renderBackground();
    this.renderNotes();
    this.renderPlayhead();

    // Ensure proper rendering order
    this.container.sortChildren();
  }

  /**
   * Set note data and trigger re-render
   */
  public setNotes(notes: NoteData[]): void {
    this.notes = notes;
    this.initializeScales(); // Recalculate scales based on new data
    this.render();
  }

  /**
   * Set current playback time and update playhead
   */
  public setTime(time: number): void {
    this.state.currentTime = time;

    // Only auto-scroll if user is not actively panning
    if (!this.state.isPanning) {
      const pxPerSecond = this.timeScale(1) * this.state.zoomX;
      const timeOffsetPx = time * pxPerSecond;

      // Keep playhead fixed (just after piano keys) by offsetting the roll
      // so that the note at the current time is always under the playhead.
      this.state.panX = -timeOffsetPx;
      this.clampPanX();
    }

    // Force immediate render without throttling for seek operations
    // This ensures visual feedback is instant when seeking
    this.lastRenderTime = 0; // Reset throttle timer
    this.render(); // Render immediately instead of requestRender()
  }

  /**
   * Zoom in/out on X axis (time)
   */
  public zoomX(factor: number): void {
    this.state.zoomX *= factor;
    this.state.zoomX = Math.max(0.1, Math.min(10, this.state.zoomX));
    this.clampPanX();
    this.requestRender();
  }

  /**
   * Zoom in/out on Y axis (pitch) - DISABLED
   */
  public zoomY(factor: number): void {
    // Y-axis zoom is disabled to maintain fixed height
    this.state.zoomY *= factor;
    this.state.zoomY = Math.max(0.1, Math.min(5, this.state.zoomY));

    const noteRange = this.options.noteRange.max - this.options.noteRange.min;
    const rowHeight =
      ((this.options.height - 40) / noteRange) * this.state.zoomY;

    // Y-axis zoom is disabled

    // this.requestRender();
  }

  /**
   * Pan the view by specified pixels
   */
  public pan(deltaX: number, deltaY: number): void {
    // this.state.panX += deltaX;
    const nextPanX = this.state.panX + deltaX;
    this.state.panX = Math.max(0, Math.min(nextPanX, this.state.maxPanX));
    // this.state.panY += deltaY; // Y-axis panning disabled
    this.requestRender();
  }

  /**
   * Reset zoom and pan to default values
   */
  public resetView(): void {
    this.state.zoomX = 1;
    // this.state.zoomY = 1; // Y zoom stays at 1
    this.state.panX = 0;
    this.clampPanX();
    this.requestRender();
  }

  /**
   * Destroy the piano roll and clean up resources
   */
  public destroy(): void {
    this.noteGraphics.forEach((graphic) => graphic.destroy());
    this.app.destroy(true);
  }

  /**
   * Get current state for debugging
   */
  public getState(): PianoRollState {
    return { ...this.state };
  }

  /**
   * Clamp panX so that the playhead (fixed at pianoKeysOffset) always lies within
   * the timeline content. Prevents scrolling past the beginning or end.
   */
  private clampPanX(): void {
    const pianoKeysOffset = this.options.showPianoKeys ? 60 : 0;

    // Width of timeline content (without piano keys) after zoom is applied
    const contentWidth = this.timeScale.range()[1] * this.state.zoomX;

    // Visible viewport width that can show notes (excluding piano keys area)
    const viewportWidth = this.options.width - pianoKeysOffset;

    // Minimum panX so that the *last* timeline pixel can cross the playhead.
    // This equals -contentWidth (entire timeline shifted left up to playhead).
    const minPanX = -contentWidth;

    // panX should never be positive – that would push notes to the right of playhead
    const maxPanX = 0;

    this.state.panX = Math.max(minPanX, Math.min(this.state.panX, maxPanX));
  }
}

/**
 * Factory function to create a piano roll visualizer
 * @param container - HTML element to attach the canvas to
 * @param notes - Array of note data to visualize
 * @param options - Configuration options
 * @returns Piano roll instance and control methods
 */
export async function createPianoRoll(
  container: HTMLElement,
  notes: NoteData[] = [],
  options: PianoRollOptions = {}
) {
  // Create canvas element
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";

  // Clear container and add canvas
  container.innerHTML = "";
  container.appendChild(canvas);

  // Create piano roll instance
  const pianoRoll = await PianoRoll.create(canvas, options);

  // Set initial notes
  if (notes.length > 0) {
    pianoRoll.setNotes(notes);
  }

  // Return control interface
  return {
    /**
     * Update the notes being displayed
     */
    setNotes: (newNotes: NoteData[]) => pianoRoll.setNotes(newNotes),

    /**
     * Update current playback time
     */
    setTime: (time: number) => pianoRoll.setTime(time),

    /**
     * Zoom in/out on time axis
     */
    zoomX: (factor: number) => pianoRoll.zoomX(factor),

    /**
     * Zoom in/out on pitch axis
     */
    zoomY: (factor: number) => pianoRoll.zoomY(factor),

    /**
     * Pan the view
     */
    pan: (deltaX: number, deltaY: number) => pianoRoll.pan(deltaX, deltaY),

    /**
     * Reset view to default zoom and pan
     */
    resetView: () => pianoRoll.resetView(),

    /**
     * Get current state for debugging
     */
    getState: () => pianoRoll.getState(),

    /**
     * Clean up resources
     */
    destroy: () => pianoRoll.destroy(),
  };
}
