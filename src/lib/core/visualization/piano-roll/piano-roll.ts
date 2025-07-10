import * as PIXI from "pixi.js";
import { NoteData } from "@/lib/midi/types";
import { PianoRollOptions, PianoRollState } from "./types";
import { createScales } from "@/lib/core/visualization/piano-roll/utils/scales";
import {
  onPointerDown,
  onPointerMove,
  onPointerUp,
} from "@/lib/core/visualization/piano-roll/interactions/pointer";
import { onWheel } from "@/lib/core/visualization/piano-roll/interactions/wheel";
import { renderPlayhead } from "@/lib/core/visualization/piano-roll/renderers/playhead";
import { renderGrid } from "@/lib/core/visualization/piano-roll/renderers/grid";
import { renderNotes } from "@/lib/core/visualization/piano-roll/renderers/notes";
import { clampPanX } from "@/lib/core/visualization/piano-roll/utils/clamp-pan";
import { ScaleLinear } from "d3-scale";
import { clamp } from "@/lib/core/utils";

export class PianoRoll {
  public app: PIXI.Application;
  public container!: PIXI.Container;
  public notesContainer!: PIXI.Container;
  public playheadLine!: PIXI.Graphics;
  public backgroundGrid!: PIXI.Graphics;
  public loopOverlay!: PIXI.Graphics;
  public loopLines: { start: PIXI.Graphics; end: PIXI.Graphics } | null = null;

  public playheadX: number = 0;
  public notes: NoteData[] = [];
  public noteGraphics: PIXI.Graphics[] = [];
  public state: PianoRollState;
  public options: Required<PianoRollOptions>;

  // Scales for coordinate transformation
  public timeScale!: ScaleLinear<number, number>;
  public pitchScale!: ScaleLinear<number, number>;

  // Performance optimization
  private lastRenderTime = 0;
  private renderThrottleMs = 16; // ~60fps

  // Loop window (A-B) state
  public loopStart: number | null = null;
  public loopEnd: number | null = null;

  // Fixed pixel-per-second scale used for horizontal time mapping
  public pxPerSecond: number = 0;

  public onTimeChangeCallback: ((time: number) => void) | null = null;

  public backgroundLabelContainer!: PIXI.Container;
  public loopLabelContainer!: PIXI.Container;

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

    this.initializeScales();
  }

  private initializeScales(): void {
    const { timeScale, pitchScale, pxPerSecond } = createScales(
      this.notes,
      {
        width: this.options.width,
        height: this.options.height,
        noteRange: this.options.noteRange,
        showPianoKeys: this.options.showPianoKeys,
      },
      this.pxPerSecond // pass previous value if any
    );

    this.timeScale = timeScale;
    this.pitchScale = pitchScale;
    this.pxPerSecond = pxPerSecond;
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
   * Set up mouse/touch interaction for panning and zooming
   */
  private setupInteraction(): void {
    const canvas = this.app.canvas;

    // Reusable options objects
    const nonPassive: AddEventListenerOptions = { passive: false };

    // Mouse events for panning
    canvas.addEventListener(
      "mousedown",
      // this.onPointerDown.bind(this),
      (event) => onPointerDown(event, this),
      nonPassive
    );
    canvas.addEventListener(
      "mousemove",
      (event) => onPointerMove(event, this),
      nonPassive
    );
    canvas.addEventListener("mouseup", (event) => onPointerUp(event, this));
    canvas.addEventListener("mouseleave", (event) => onPointerUp(event, this));

    // Touch events - explicit non-passive options because we call preventDefault() in the handlers.
    canvas.addEventListener(
      "touchstart",
      (event) => onPointerDown(event, this),
      nonPassive
    );
    canvas.addEventListener(
      "touchmove",
      (event) => onPointerMove(event, this),
      nonPassive
    );
    canvas.addEventListener("touchend", (event) => onPointerUp(event, this));

    // Wheel event for zooming - preventDefault() is used, so keep it non-passive.
    canvas.addEventListener(
      "wheel",
      (event) => onWheel(event, this),
      nonPassive
    );

    // Prevent default touch behaviors via CSS property.
    canvas.style.touchAction = "none";
  }

  /**
   * Request render with throttling for performance
   */
  public requestRender(): void {
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
  public render(): void {
    // Update playhead first so that its computed X position is available
    // to background and note layers (e.g., pianoKeys shading uses playheadX).
    // this.renderPlayhead();
    // this.renderBackground();
    // this.renderNotes();
    renderPlayhead(this);
    renderGrid(this);
    renderNotes(this);

    // Ensure proper rendering order
    this.container.sortChildren();
  }

  /**
   * Set note data and trigger re-render
   */
  public setNotes(notes: NoteData[]): void {
    console.log("[setNotes] incoming notes", notes.length);
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
      clampPanX(this.timeScale, this.state);
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
    clampPanX(this.timeScale, this.state);

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
    clampPanX(this.timeScale, this.state);
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
    clampPanX(this.timeScale, this.state);
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

  /**
   * Update loop window markers (A-B). Pass nulls to clear.
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

  public computeTimeAtPlayhead(): number {
    const time = this.timeScale.invert(-this.state.panX / this.state.zoomX);
    // Clamp within timeline bounds
    // return Math.max(0, Math.min(time, this.timeScale.domain()[1]));
    return clamp(time, 0, this.timeScale.domain()[1]);
  }
}
