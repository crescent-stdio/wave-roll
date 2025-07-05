/**
 * PixiJS-based Piano Roll Visualizer
 *
 * High-performance piano roll component that renders MIDI notes as rectangles
 * on a canvas with zoom, pan, and playback synchronization capabilities.
 */

import * as PIXI from "pixi.js";
import { scaleLinear } from "d3-scale";
import { NoteData } from "../types";

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
  /** Time step for grid lines */
  timeStep?: number;
  /** Minor grid step (seconds) for lighter subdivision lines */
  minorTimeStep?: number;
  /** Custom note renderer function to determine color per note */
  noteRenderer?: (note: NoteData, index: number) => number;
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
  private loopOverlay!: PIXI.Graphics;
  private loopLines: { start: PIXI.Graphics; end: PIXI.Graphics } | null = null;

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

  // Loop window (A–B) state
  private loopStart: number | null = null;
  private loopEnd: number | null = null;

  // Fixed pixel-per-second scale used for horizontal time mapping
  private pxPerSecond: number | null = null;

  private onTimeChangeCallback: ((time: number) => void) | null = null;

  private backgroundLabelContainer!: PIXI.Container;
  private loopLabelContainer!: PIXI.Container;

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
      timeStep: 1,
      minorTimeStep: 0.1,
      noteRenderer: undefined,
      ...options,
    } as Required<PianoRollOptions>;

    // Initialize state
    this.state = {
      zoomX: 1,
      zoomY: 1,
      panX: 0,
      panY: 0, // Always 0 - no vertical panning
      currentTime: 0,
      isPanning: false,
      lastPointerPos: { x: 0, y: 0 },
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

    // Container for time grid labels (kept separate to avoid addChild on Graphics)
    this.backgroundLabelContainer = new PIXI.Container();
    this.backgroundLabelContainer.zIndex = 2;
    this.container.addChild(this.backgroundLabelContainer);

    // Notes container for all note rectangles
    this.notesContainer = new PIXI.Container();
    this.notesContainer.zIndex = 10;
    this.container.addChild(this.notesContainer);

    // Playhead line (always on top)
    this.playheadLine = new PIXI.Graphics();
    this.playheadLine.zIndex = 1000;
    this.container.addChild(this.playheadLine);

    // Overlay for loop window
    this.loopOverlay = new PIXI.Graphics();
    this.loopOverlay.zIndex = 500; // below playhead but above notes
    this.container.addChild(this.loopOverlay);

    // Container for loop A/B labels
    this.loopLabelContainer = new PIXI.Container();
    this.loopLabelContainer.zIndex = 600; // alongside loop lines
    this.container.addChild(this.loopLabelContainer);

    // Vertical lines for A (start) and B (end)
    const startLine = new PIXI.Graphics();
    const endLine = new PIXI.Graphics();
    startLine.zIndex = 600;
    endLine.zIndex = 600;
    this.container.addChild(startLine);
    this.container.addChild(endLine);
    this.loopLines = { start: startLine, end: endLine };
  }

  /**
   * Initialize coordinate scales for time and pitch
   */
  private initializeScales(): void {
    const maxTime =
      this.notes.length > 0
        ? Math.max(...this.notes.map((n) => n.time + n.duration))
        : 60; // Default 60 seconds if no notes

    // Preserve a constant pixel-per-second ratio to ensure grid spacing
    // stays visually consistent even when the total track length changes.
    const pianoKeysOffset = this.options.showPianoKeys ? 60 : 0;
    if (this.pxPerSecond === null) {
      // Establish baseline px/sec so that about 8 seconds are visible
      // in the viewport at the default zoom level, resulting in a
      // looser grid spacing that is easier to read. Users can still
      // zoom out to view more of the timeline if desired.
      const TARGET_VISIBLE_SECONDS = 8;
      this.pxPerSecond =
        (this.options.width - pianoKeysOffset) / TARGET_VISIBLE_SECONDS;
    }

    const rangeEnd = maxTime * this.pxPerSecond;

    this.timeScale = scaleLinear().domain([0, maxTime]).range([0, rangeEnd]);

    this.pitchScale = scaleLinear()
      .domain([this.options.noteRange.min, this.options.noteRange.max])
      .range([this.options.height - 20, 20]); // Leave margin at top/bottom
  }

  /**
   * Set up mouse/touch interaction for panning and zooming
   */
  private setupInteraction(): void {
    const canvas = this.app.canvas;

    // Reusable options objects
    const nonPassive: AddEventListenerOptions = { passive: false };

    // Mouse events for panning
    canvas.addEventListener(
      "mousedown",
      this.onPointerDown.bind(this),
      nonPassive
    );
    canvas.addEventListener(
      "mousemove",
      this.onPointerMove.bind(this),
      nonPassive
    );
    canvas.addEventListener("mouseup", this.onPointerUp.bind(this));
    canvas.addEventListener("mouseleave", this.onPointerUp.bind(this));

    // Touch events – explicit non-passive options because we call preventDefault() in the handlers.
    canvas.addEventListener(
      "touchstart",
      this.onPointerDown.bind(this),
      nonPassive
    );
    canvas.addEventListener(
      "touchmove",
      this.onPointerMove.bind(this),
      nonPassive
    );
    canvas.addEventListener("touchend", this.onPointerUp.bind(this));

    // Wheel event for zooming – preventDefault() is used, so keep it non-passive.
    canvas.addEventListener("wheel", this.onWheel.bind(this), nonPassive);

    // Prevent default touch behaviors via CSS property.
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

    // Update currentTime based on new panX so external UI can stay in sync.
    this.state.currentTime = this.computeTimeAtPlayhead();
    if (this.onTimeChangeCallback) {
      this.onTimeChangeCallback(this.state.currentTime);
    }

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

    // Use cursor position as anchor only when user holds Ctrl/Cmd (precision zoom).
    // Otherwise anchor to playhead so that the current playback point stays fixed.
    const usePointerAnchor = event.ctrlKey || event.metaKey;
    const anchorX = usePointerAnchor ? event.offsetX : undefined;

    if (deltaY < 0) {
      this.zoomX(zoomFactor, anchorX);
    } else {
      this.zoomX(1 / zoomFactor, anchorX);
    }
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
    // Clear previous labels to avoid duplicates and stale objects
    if (this.backgroundLabelContainer) {
      this.backgroundLabelContainer.removeChildren();
    }
    if (this.loopLabelContainer) {
      this.loopLabelContainer.removeChildren();
    }

    // Remove any previously added children (e.g., text labels) and clear drawings
    this.backgroundGrid.removeChildren();
    this.backgroundGrid.clear();

    // Clear loop overlay & lines before redrawing
    this.loopOverlay.clear();
    this.loopOverlay.removeChildren();

    if (this.loopLines) {
      // Reset geometry and children for the vertical A/B marker lines.
      this.loopLines.start.clear();
      this.loopLines.start.removeChildren();

      this.loopLines.end.clear();
      this.loopLines.end.removeChildren();
    }

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

    // Time grid lines (major & minor)
    const timeStep = this.options.timeStep;
    const minorStep = this.options.minorTimeStep;
    const maxTime = this.timeScale.domain()[1];

    // Helper to draw vertical grid line
    const drawGridLine = (tVal: number, alpha: number, showLabel: boolean) => {
      const x =
        this.timeScale(tVal) * this.state.zoomX +
        this.state.panX +
        (this.options.showPianoKeys ? 60 : 0);
      this.backgroundGrid.moveTo(x, 0);
      this.backgroundGrid.lineTo(x, this.options.height);
      this.backgroundGrid.stroke({ width: 1, color: 0xe0e0e0, alpha });

      if (showLabel) {
        const label = new PIXI.Text({
          text: tVal.toFixed(1) + "s",
          style: {
            fontSize: 10,
            fill: 0x555555,
            align: "center",
          },
        });
        label.x = x + 2;
        label.y = this.options.height - 14;
        this.backgroundLabelContainer.addChild(label);
      }
    };

    // Major lines
    for (let t = 0; t <= maxTime; t += timeStep) {
      drawGridLine(t, 1.0, true);
    }

    // Minor subdivision lines (draw after to appear underneath labels)
    if (minorStep && minorStep < timeStep) {
      const eps = minorStep / 1000; // tolerance for float comparisons
      for (let t = 0; t <= maxTime + eps; t += minorStep) {
        // skip if approximately a major line
        if (
          Math.abs(t % timeStep) < eps ||
          Math.abs(timeStep - (t % timeStep)) < eps
        ) {
          continue;
        }
        drawGridLine(t, 0.25, false);
      }
    }

    // -------------------------------------------------------------
    // Draw loop window highlight & marker lines
    //   • Individual A/B lines are shown if each point is set.
    //   • Shaded overlay is shown only when BOTH points exist.
    // -------------------------------------------------------------

    if (this.loopLines) {
      const pianoKeysOffset = this.options.showPianoKeys ? 60 : 0;
      const lineWidth = 2;

      // Helper to draw a single vertical line + label
      const drawLine = (
        g: PIXI.Graphics,
        x: number,
        color: number,
        label: string
      ) => {
        g.moveTo(x, 0);
        g.lineTo(x, this.options.height);
        g.stroke({ width: lineWidth, color, alpha: 0.9 });

        const text = new PIXI.Text({
          text: label,
          style: { fontSize: 10, fill: color, align: "center" },
        });
        text.x = x + 2;
        text.y = 0;
        this.loopLabelContainer.addChild(text);
      };

      let startX: number | null = null;
      let endX: number | null = null;

      if (this.loopStart !== null) {
        startX =
          this.timeScale(this.loopStart) * this.state.zoomX +
          this.state.panX +
          pianoKeysOffset;

        drawLine(
          this.loopLines.start,
          startX,
          0x00b894,
          this.loopStart.toFixed(1) + "s"
        );
      }

      if (this.loopEnd !== null) {
        endX =
          this.timeScale(this.loopEnd) * this.state.zoomX +
          this.state.panX +
          pianoKeysOffset;

        drawLine(
          this.loopLines.end,
          endX,
          0xff7f00,
          this.loopEnd.toFixed(1) + "s"
        );
      }

      // Draw translucent overlay only when both points are defined
      if (startX !== null && endX !== null) {
        const overlayColor = 0xfff3cd; // light yellow
        this.loopOverlay.rect(
          startX,
          0,
          Math.max(0, endX - startX),
          this.options.height
        );
        this.loopOverlay.fill({ color: overlayColor, alpha: 0.35 });
      }
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

    this.notes.forEach((note, index) => {
      // Skip notes outside viewport (only check time, not pitch)
      if (
        note.time + note.duration < viewportTimeStart ||
        note.time > viewportTimeEnd
      ) {
        return;
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

      // Determine note color using custom renderer or default
      const noteColor = this.options.noteRenderer
        ? this.options.noteRenderer(note, index)
        : this.options.noteColor;

      // Note color based on velocity
      const alpha = 0.3 + note.velocity * 0.7; // Scale alpha based on velocity

      // Draw filled rectangle
      noteGraphic.rect(x, y - height / 2, width, height);
      noteGraphic.fill({ color: noteColor, alpha: alpha });

      // Note border
      noteGraphic.rect(x, y - height / 2, width, height);
      noteGraphic.stroke({
        width: 1,
        color: noteColor,
        alpha: 0.8,
      });

      this.notesContainer.addChild(noteGraphic);
      this.noteGraphics.push(noteGraphic);
    });
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
    // Update playhead first so that its computed X position is available
    // to background and note layers (e.g., pianoKeys shading uses playheadX).
    this.renderPlayhead();
    this.renderBackground();
    this.renderNotes();

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
  public zoomX(factor: number, anchorX?: number): void {
    if (factor === 1) return;

    const oldZoom = this.state.zoomX;
    const newZoom = Math.max(0.1, Math.min(10, oldZoom * factor));

    // Determine anchor: provided pixel position or playhead position by default
    const pianoKeysOffset = this.options.showPianoKeys ? 60 : 0;
    const anchorPx = anchorX !== undefined ? anchorX : pianoKeysOffset;

    // Compute the timeline time located at anchor before zoom change
    const timeAtAnchor = this.timeScale.invert(
      (anchorPx - pianoKeysOffset - this.state.panX) / oldZoom
    );

    // Update zoom level
    this.state.zoomX = newZoom;

    // Recalculate panX so that the same time remains under the anchor pixel
    this.state.panX =
      anchorPx - pianoKeysOffset - this.timeScale(timeAtAnchor) * newZoom;

    console.log("[zoomX]", {
      anchorPx,
      timeAtAnchor,
      newZoom,
      panX: this.state.panX,
    });
    // Clamp pan within valid bounds
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
    this.state.panX = this.state.panX + deltaX;
    this.clampPanX();
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
   * Update timeStep (grid spacing in seconds) and re-render background
   */
  public setTimeStep(step: number): void {
    this.options.timeStep = Math.max(0.01, step);
    this.requestRender();
  }

  /**
   * Update minor grid step and re-render
   */
  public setMinorTimeStep(step: number): void {
    this.options.minorTimeStep = Math.max(0.001, step);
    this.requestRender();
  }

  /**
   * Get current timeStep
   */
  public getTimeStep(): number {
    return this.options.timeStep;
  }

  /**
   * Get current minor timeStep
   */
  public getMinorTimeStep(): number {
    return this.options.minorTimeStep;
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

  /**
   * Update loop window markers (A–B). Pass nulls to clear.
   */
  public setLoopWindow(start: number | null, end: number | null): void {
    this.loopStart = start;
    this.loopEnd = end;
    this.requestRender();
  }

  /**
   * Register a callback that fires whenever the time under the fixed playhead changes.
   * This happens when the visual timeline is panned or zoomed.
   */
  public onTimeChange(callback: (time: number) => void): void {
    this.onTimeChangeCallback = callback;
  }

  private computeTimeAtPlayhead(): number {
    const time = this.timeScale.invert(-this.state.panX / this.state.zoomX);
    // Clamp within timeline bounds
    return Math.max(0, Math.min(time, this.timeScale.domain()[1]));
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

    /**
     * Update timeStep (grid spacing in seconds)
     */
    setTimeStep: (step: number) => pianoRoll.setTimeStep(step),

    /**
     * Get current timeStep
     */
    getTimeStep: () => pianoRoll.getTimeStep(),

    /**
     * Update loop window markers (A–B)
     */
    setLoopWindow: (start: number | null, end: number | null) =>
      pianoRoll.setLoopWindow(start, end),

    /**
     * Register callback for time changes due to panning/zooming
     */
    onTimeChange: (callback: (time: number) => void) =>
      pianoRoll.onTimeChange(callback),

    /**
     * Update minor grid step and re-render
     */
    setMinorTimeStep: (step: number) => pianoRoll.setMinorTimeStep(step),

    /**
     * Get current minor timeStep
     */
    getMinorTimeStep: () => pianoRoll.getMinorTimeStep(),
  };
}
