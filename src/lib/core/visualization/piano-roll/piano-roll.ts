import * as PIXI from "pixi.js";
import { ControlChangeEvent, NoteData } from "@/lib/midi/types";
import { PianoRollConfig, PianoRollViewState } from "./types";
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
import { renderSustains } from "@/lib/core/visualization/piano-roll/renderers/sustains";
import {
  clampPanX,
  clampPanY,
} from "@/lib/core/visualization/piano-roll/utils/clamp-pan";
import { ScaleLinear } from "d3-scale";
import { clamp } from "@/lib/core/utils";
import { drawOverlapRegions } from "@/core/visualization/piano-roll/renderers/overlaps";
import { NoteInterval } from "@/lib/core/controls/utils/overlap";
// (Note) Evaluation utilities removed - no longer required here

export class PianoRoll {
  public app: PIXI.Application;
  public container!: PIXI.Container;
  public notesContainer!: PIXI.Container;
  public sustainContainer!: PIXI.Container;
  public playheadLine!: PIXI.Graphics;
  public backgroundGrid!: PIXI.Graphics;
  /** Waveform overlay layer (rendered below the grid) */
  public waveformLayer!: PIXI.Graphics;
  /** Waveform overlay drawn above the piano-keys area so it shows left of playhead */
  public waveformKeysLayer!: PIXI.Graphics;
  public loopOverlay!: PIXI.Graphics;
  public loopLines: { start: PIXI.Graphics; end: PIXI.Graphics } | null = null;
  /** Semi-transparent overlay that visualizes sustain-pedal (CC64) regions */
  public sustainOverlay!: PIXI.Graphics;
  public overlapOverlay!: PIXI.Graphics;
  public overlapIntervals: NoteInterval[] = [];

  // Tooltip element for note hover information
  private tooltipDiv: HTMLDivElement | null = null;

  public playheadX: number = 0;
  public notes: NoteData[] = [];
  public noteGraphics: PIXI.Graphics[] = [];
  public controlChanges: ControlChangeEvent[] = [];
  /**
   * Sprite-based note objects used by the default renderer (Sprite batching).
   * We keep the original `noteGraphics` array for compatibility with the
   * legacy Graphics renderer that can still be enabled manually. Only one of
   * the two arrays is populated at any given time.
   */
  public noteSprites: PIXI.Sprite[] = [];
  public state: PianoRollViewState;
  public options: Required<PianoRollConfig>;

  /**
   * Indicates whether the note layer needs a full geometry redraw. We set this
   * flag to `true` whenever the underlying note data, zoom level, or canvas
   * dimensions change. During regular playback the timeline scrolls by
   * translating the `notesContainer` instead of erasing and re-drawing every
   * individual note each frame, so we can skip heavy redraw work when this
   * flag is `false`.
   */
  private needsNotesRedraw: boolean = true;

  // Scales for coordinate transformation
  public timeScale!: ScaleLinear<number, number>;
  public pitchScale!: ScaleLinear<number, number>;

  // Performance optimization
  private lastRenderTime = 0;
  // private renderThrottleMs = 16; // ~60fps
  private renderThrottleMs = 20; // ~50fps

  // Loop window (A-B) state
  public loopStart: number | null = null;
  public loopEnd: number | null = null;

  // Fixed pixel-per-second scale used for horizontal time mapping. Null until first scale calculation.
  public pxPerSecond: number | null = null;

  public onTimeChangeCallback: ((time: number) => void) | null = null;

  public backgroundLabelContainer!: PIXI.Container;
  public loopLabelContainer!: PIXI.Container;

  private constructor(
    canvas: HTMLCanvasElement,
    options: PianoRollConfig = {}
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
    } as Required<PianoRollConfig>;

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
    options: PianoRollConfig = {}
  ): Promise<PianoRoll> {
    const instance = new PianoRoll(canvas, options);
    await instance.initializeApp(canvas);
    instance.initializeContainers();
    instance.initializeScales();
    // Add tooltip overlay after containers are ready
    instance.initializeTooltip(canvas);
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
    // console.log(
    //   "[initializeApp] renderer",
    //   this.app.renderer.resolution,
    //   this.app.renderer.width,
    //   this.app.renderer.height
    // );
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

    // Waveform layer (below grid)
    this.waveformLayer = new PIXI.Graphics();
    this.waveformLayer.zIndex = 0;
    this.container.addChild(this.waveformLayer);

    // Waveform layer shown above piano-keys fill so it is visible left of playhead
    this.waveformKeysLayer = new PIXI.Graphics();
    // Keep it below notes and loop overlays, but above background grid fill
    // Use the same zIndex as labels but add before them so labels stay on top
    this.waveformKeysLayer.zIndex = 2;
    this.container.addChild(this.waveformKeysLayer);

    // Container for time grid labels (kept separate to avoid addChild on Graphics)
    this.backgroundLabelContainer = new PIXI.Container();
    this.backgroundLabelContainer.zIndex = 2;
    this.container.addChild(this.backgroundLabelContainer);

    // Notes container for all note rectangles
    this.notesContainer = new PIXI.Container();
    this.notesContainer.zIndex = 10;
    this.container.addChild(this.notesContainer);

    this.sustainContainer = new PIXI.Container();
    this.sustainContainer.zIndex = 5;
    this.container.addChild(this.sustainContainer);

    // Overlay for sustain pedal (below notes to avoid covering them)
    this.sustainOverlay = new PIXI.Graphics();
    this.sustainOverlay.zIndex = -10; // ensure below note sprites
    this.sustainContainer.addChild(this.sustainOverlay);

    // Playhead line (always on top)
    this.playheadLine = new PIXI.Graphics();
    this.playheadLine.zIndex = 1000;
    this.container.addChild(this.playheadLine);

    // Overlay for loop window
    this.loopOverlay = new PIXI.Graphics();
    this.loopOverlay.zIndex = 500; // below playhead but above notes
    this.container.addChild(this.loopOverlay);

    // Overlay for multi-track overlaps (semi-transparent red)
    this.overlapOverlay = new PIXI.Graphics();
    this.overlapOverlay.zIndex = 20; // above grid, below notes
    this.container.addChild(this.overlapOverlay);

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

  private initializeTooltip(canvas: HTMLCanvasElement): void {
    const parent = canvas.parentElement;
    if (!parent) return;

    // Ensure parent has positioning context for absolute children
    const computedStyle = window.getComputedStyle(parent);
    if (computedStyle.position === "static") {
      parent.style.position = "relative";
    }

    const div = document.createElement("div");
    Object.assign(div.style, {
      position: "absolute",
      zIndex: "1000",
      pointerEvents: "none",
      background: "rgba(0, 0, 0, 0.8)",
      color: "#ffffff",
      padding: "4px 6px",
      borderRadius: "4px",
      fontSize: "12px",
      lineHeight: "1.2",
      whiteSpace: "nowrap",
      display: "none",
    });

    parent.appendChild(div);
    this.tooltipDiv = div;
  }

  /**
   * Find all notes at the given time and pitch position
   */
  private findNotesAtPosition(time: number, pitch: number): NoteData[] {
    const matchingNotes: NoteData[] = [];
    const tolerance = 0.5; // Half a semitone tolerance for pitch matching

    for (const note of this.notes) {
      // Check if the time falls within the note's duration
      if (time >= note.time && time <= note.time + note.duration) {
        // Check if the pitch matches (with tolerance)
        if (Math.abs(note.midi - pitch) <= tolerance) {
          matchingNotes.push(note);
        }
      }
    }

    return matchingNotes;
  }

  /**
   * Show tooltip populated with the given note information.
   */
  public showNoteTooltip(
    note: NoteData,
    event: PIXI.FederatedPointerEvent
  ): void {
    if (!this.tooltipDiv) return;

    // Calculate the time and pitch from the mouse position
    const pianoKeysOffset = this.options.showPianoKeys ? 60 : 0;
    const localX = event.global.x - pianoKeysOffset - this.state.panX;
    const time = this.timeScale.invert(localX / this.state.zoomX);

    // Find all notes at this position
    const notesAtPosition = this.findNotesAtPosition(time, note.midi);

    const fileInfoMap = (this as any).fileInfoMap as
      | Record<
          string,
          { displayName: string; fileName: string; kind: string; color: number }
        >
      | undefined;

    // Group notes by unique file IDs
    const fileInfos: Map<string, { info: any; notes: NoteData[] }> = new Map();

    for (const n of notesAtPosition) {
      if (n.fileId && fileInfoMap) {
        const info = fileInfoMap[n.fileId];
        if (info) {
          if (!fileInfos.has(n.fileId)) {
            fileInfos.set(n.fileId, { info, notes: [] });
          }
          fileInfos.get(n.fileId)!.notes.push(n);
        }
      }
    }

    // Build tooltip content with all file information
    const header = `${note.name} (MIDI: ${note.midi})`;

    let fileLines = "";
    if (fileInfos.size > 0) {
      const sortedFiles = Array.from(fileInfos.entries()).sort((a, b) => {
        // Sort by kind priority: Reference first, then Estimate, then MIDI
        const kindOrder: Record<string, number> = {
          Reference: 0,
          Estimate: 1,
          MIDI: 2,
        };
        const orderA = kindOrder[a[1].info.kind] ?? 3;
        const orderB = kindOrder[b[1].info.kind] ?? 3;
        return orderA - orderB;
      });

      fileLines = sortedFiles
        .map(([fileId, { info, notes }]) => {
          const swatch = `<span style="display:inline-block;width:12px;height:12px;background:#${info.color
            .toString(16)
            .padStart(
              6,
              "0"
            )};border-radius:2px;margin-right:8px;vertical-align:middle;border:1px solid rgba(255,255,255,0.3);"></span>`;
          return `<div style="margin-top:4px;display:flex;align-items:center;">${swatch}<span style="font-weight:500;">${info.kind}: ${info.displayName}</span></div>`;
        })
        .join("");
    }

    // Calculate the time range for all overlapping notes
    let minStartTime = note.time;
    let maxEndTime = note.time + note.duration;

    if (notesAtPosition.length > 1) {
      for (const n of notesAtPosition) {
        minStartTime = Math.min(minStartTime, n.time);
        maxEndTime = Math.max(maxEndTime, n.time + n.duration);
      }
    }

    this.tooltipDiv.innerHTML = `
      <div><strong>${header}</strong></div>
      ${fileLines}
      <div style="margin-top:4px;color:rgba(255,255,255,0.9);">Time: ${minStartTime.toFixed(2)}s - ${maxEndTime.toFixed(2)}s</div>
      <div style="color:rgba(255,255,255,0.9);">Velocity: ${note.velocity.toFixed(2)}</div>
    `;
    this.tooltipDiv.style.display = "block";
    this.moveTooltip(event);
  }

  /** Update tooltip position to follow the pointer */
  public moveTooltip(event: PIXI.FederatedPointerEvent): void {
    if (!this.tooltipDiv) return;

    const offset = 10;

    const parent = this.tooltipDiv.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();

    // Position tooltip relative to parent so it stays inside the same stacking context.
    const x = event.clientX - parentRect.left + offset;
    const y = event.clientY - parentRect.top + offset;

    this.tooltipDiv.style.left = `${x}px`;
    this.tooltipDiv.style.top = `${y}px`;
  }

  /** Hide the tooltip */
  public hideTooltip(): void {
    if (this.tooltipDiv) {
      this.tooltipDiv.style.display = "none";
    }
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

    renderPlayhead(this);
    renderGrid(this);

    // Only re-generate note geometry when required; otherwise we simply shift
    // the container horizontally (pan) which is much cheaper than rebuilding
    // thousands of Graphics paths every frame.
    if (this.needsNotesRedraw) {
      renderNotes(this);
      this.needsNotesRedraw = false;
    }

    // Redraw sustain-pedal overlay so it reflects current pan/zoom
    renderSustains(this);

    // Apply horizontal & vertical pan via container transforms so we avoid
    // recalculating geometry for thousands of notes on every scroll.
    this.notesContainer.x = this.state.panX;
    this.notesContainer.y = this.state.panY;

    // Keep sustain & overlap overlays aligned with the notes layer.
    this.sustainContainer.x = this.state.panX;
    this.sustainContainer.y = this.state.panY;

    this.overlapOverlay.x = this.state.panX;
    this.overlapOverlay.y = this.state.panY;

    // Ensure proper rendering order
    this.container.sortChildren();
  }

  /**
   * Set note data and trigger re-render
   */
  public setNotes(notes: NoteData[]): void {
    // console.log("[setNotes] incoming notes", notes.length);
    this.notes = notes;
    this.initializeScales(); // Recalculate scales based on new data
    this.needsNotesRedraw = true; // geometry must be rebuilt
    this.render();
  }

  /**
   * Set current playback time and update playhead
   */
  public setTime(time: number): void {
    // console.log(
    //     "[setTime] time",
    //     time,
    //     "panX(before)",
    //     this.state.panX,
    //     "zoomX"
    //   );
    this.state.currentTime = time;

    // Only auto-scroll if user is not actively panning
    if (!this.state.isPanning) {
      const pxPerSecond = this.timeScale(1) * this.state.zoomX;
      const timeOffsetPx = time * pxPerSecond;

      // Keep playhead fixed (just after piano keys) by offsetting the roll
      // so that the note at the current time is always under the playhead.
      this.state.panX = -timeOffsetPx;
      clampPanX(this.timeScale, this.state);
      // console.log(
      //     "[setTime] pxPerSecond",
      //     pxPerSecond,
      //     "timeOffsetPx",
      //     timeOffsetPx,
      //     "panX(after)",
      //     this.state.panX
      //   );
    }

    // To avoid heavy full re-renders during regular playback we no longer
    // call `render()` directly here. Instead we delegate to `requestRender()`,
    // which respects the internal 16 ms throttle (≈60 FPS).
    // For explicit seek operations the PianoRollManager may still call
    // `render()` immediately, so this change is safe.

    this.requestRender();
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

    // // console.log("[zoomX]", {
    //   anchorPx,
    //   timeAtAnchor,
    //   newZoom,
    //   panX: this.state.panX,
    // });
    // Clamp pan within valid bounds
    clampPanX(this.timeScale, this.state);

    // Changing zoom affects note width -> full redraw required
    this.needsNotesRedraw = true;

    this.requestRender();
  }

  /**
   * Zoom in/out on Y axis (pitch)
   */
  public zoomY(factor: number): void {
    if (factor === 1) return;
    const oldZoom = this.state.zoomY;
    const newZoom = Math.max(0.2, Math.min(5, oldZoom * factor));
    if (newZoom === oldZoom) return;
    this.state.zoomY = newZoom;

    // Ensure panY remains within bounds after zoom change
    clampPanY(this.pitchScale, this.state, this.options.height);

    // Changing vertical zoom affects note height & grid spacing → full redraw
    this.needsNotesRedraw = true;
    this.requestRender();
  }

  /**
   * Pan the view by specified pixels
   */
  public pan(deltaX: number, deltaY: number): void {
    this.state.panX = this.state.panX + deltaX;
    this.state.panY = this.state.panY + deltaY;

    clampPanX(this.timeScale, this.state);
    clampPanY(this.pitchScale, this.state, this.options.height);

    this.requestRender();
  }

  /**
   * Reset zoom and pan to default values
   */
  public resetView(): void {
    this.state.zoomX = 1;
    this.state.zoomY = 1;
    this.state.panX = 0;
    this.state.panY = 0;
    clampPanX(this.timeScale, this.state);
    clampPanY(this.pitchScale, this.state, this.options.height);
    this.requestRender();
  }

  /**
   * Resize the PixiJS renderer and recompute scales/render.
   * @param width New canvas width in pixels
   * @param height New canvas height in pixels (defaults to existing height)
   */
  public resize(width: number, height?: number): void {
    const newWidth = Math.max(1, Math.floor(width));
    const newHeight = Math.max(1, Math.floor(height ?? this.options.height));

    if (newWidth === this.options.width && newHeight === this.options.height) {
      return; // nothing to do
    }

    // Update stored dimensions
    this.options.width = newWidth;
    this.options.height = newHeight;

    // Resize Pixi renderer
    this.app.renderer.resize(newWidth, newHeight);

    // Recalculate scales based on new size and re-render
    // IMPORTANT: Drop cached pxPerSecond so createScales picks a new value
    // that matches the new width. Otherwise scrolling speed stays stuck at
    // the ratio that was computed when the canvas width was near-zero.
    this.pxPerSecond = null;
    this.initializeScales();
    this.needsNotesRedraw = true;
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
    // Clean up legacy Graphics objects (if any)
    this.noteGraphics.forEach((graphic) => graphic.destroy());
    // Clean up Sprite instances used by the default renderer
    this.noteSprites.forEach((sprite) => sprite.destroy());
    this.app.destroy(true);
  }

  /**
   * Get current state for debugging
   */
  public getState(): PianoRollViewState {
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
    // The playhead is visually fixed just after the piano-keys column. Because
    // `setTime()` keeps that column anchored by translating the full timeline
    // by `panX = -time * pxPerSecond`, converting the current translation
    // back to seconds is straightforward: simply undo the scaling applied by
    // `timeScale` and the current zoom level.

    const time = this.timeScale.invert(-this.state.panX / this.state.zoomX);

    // Clamp within timeline bounds to avoid negative times or overshoot.
    return clamp(time, 0, this.timeScale.domain()[1]);
  }

  public setOverlapRegions(overlaps: NoteInterval[]): void {
    // Persist for external access/debugging
    this.overlapIntervals = overlaps;

    // Delegate actual rendering to dedicated helper
    drawOverlapRegions(this, overlaps);
  }

  public setControlChanges(controlChanges: ControlChangeEvent[]): void {
    this.controlChanges = controlChanges;
    // Mark for full note-layer redraw so sustain overlay refreshes
    this.needsNotesRedraw = true;
    this.render();
  }
}
