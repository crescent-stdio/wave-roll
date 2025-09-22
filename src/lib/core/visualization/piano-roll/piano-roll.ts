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
import { pinchStart, pinchMove, pinchEnd } from "@/lib/core/visualization/piano-roll/interactions/pinch";
import { renderPlayhead } from "@/lib/core/visualization/piano-roll/renderers/playhead";
import { renderGrid } from "@/lib/core/visualization/piano-roll/renderers/grid";
import { renderNotes } from "@/lib/core/visualization/piano-roll/renderers/notes";
import { renderSustains } from "@/lib/core/visualization/piano-roll/renderers/sustains";
import { initializeTooltipOverlay, initializeHelpOverlay } from "@/lib/core/visualization/piano-roll/ui/overlays";
import {
  clampPanX,
  clampPanY,
} from "@/lib/core/visualization/piano-roll/utils/clamp-pan";
import { ScaleLinear } from "d3-scale";
import { clamp } from "@/lib/core/utils";
import { drawOverlapRegions } from "@/core/visualization/piano-roll/renderers/overlaps";
import { NoteInterval } from "@/lib/core/controls/utils/overlap";
import type { FileInfoMap } from "./types-internal";
import { initializeContainers } from "@/lib/core/visualization/piano-roll/ui/containers";
// (Note) Evaluation utilities removed - no longer required here

export class PianoRoll {
  public app: PIXI.Application;
  public container!: PIXI.Container;
  public domContainer!: HTMLElement;
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
  /** Mask to clip notes/sustains so they never overlap the waveform band */
  public notesMask!: PIXI.Graphics;
  public overlapIntervals: NoteInterval[] = [];

  // Tooltip element for note hover information
  private tooltipDiv: HTMLDivElement | null = null;
  // Help button and panel (overlay UI for interaction hints)
  private helpButtonEl: HTMLButtonElement | null = null;
  private helpPanelEl: HTMLDivElement | null = null;

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
  private renderThrottleMs = 16; // ~60fps
  private rafId: number | null = null;
  
  // Performance metrics
  private performanceMetrics = {
    renderCount: 0,
    totalRenderTime: 0,
    slowRenders: 0,
    skippedRenders: 0,
    setTimeCount: 0,
    lastRenderTime: 0,
  };

  // Loop window (A-B) state
  public loopStart: number | null = null;
  public loopEnd: number | null = null;

  // Fixed pixel-per-second scale used for horizontal time mapping. Null until first scale calculation.
  public pxPerSecond: number | null = null;

  public onTimeChangeCallback: ((time: number) => void) | null = null;

  public backgroundLabelContainer!: PIXI.Container;
  public loopLabelContainer!: PIXI.Container;
  // Optional per-renderer caches/flags injected by handlers (intentionally public)
  // These are used by renderers for overlays, markers and file metadata.
  public patternSprites?: PIXI.TilingSprite[];
  public hatchSprites?: PIXI.TilingSprite[];
  public onsetSprites?: PIXI.Sprite[];
  public fileColors?: Record<string, number>;
  public highlightMode?: string;
  public originalOnsetMap?: Record<string, number>;
  public onlyOriginalOnsets?: boolean;
  public fileInfoMap?: FileInfoMap;

  private constructor(
    canvas: HTMLCanvasElement,
    domContainer: HTMLElement,
    options: PianoRollConfig = {}
  ) {
    // Store DOM container reference
    this.domContainer = domContainer;
    
    // Set default options
    this.options = {
      width: 800,
      height: 400,
      backgroundColor: 0xffffff,
      noteColor: 0x4285f4,
      playheadColor: 0x1e40af,
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
    // Reserve bottom pixels for waveform band so pitch scale never maps into it
    const bandPadding = 6;
    const bandHeight = Math.max(
      24,
      Math.min(96, Math.floor(this.options.height * 0.22))
    );
    const reservedBottomPx = bandPadding + bandHeight;

    const { timeScale, pitchScale, pxPerSecond } = createScales(
      this.notes,
      {
        width: this.options.width,
        height: this.options.height,
        noteRange: this.options.noteRange,
        showPianoKeys: this.options.showPianoKeys,
      },
      this.pxPerSecond,
      8,
      reservedBottomPx
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
    domContainer: HTMLElement,
    options: PianoRollConfig = {}
  ): Promise<PianoRoll> {
    const instance = new PianoRoll(canvas, domContainer, options);
    await instance.initializeApp(canvas);
    instance.initializeContainers();
    instance.initializeScales();
    // Add tooltip overlay after containers are ready
    instance.initializeTooltip(canvas);
    instance.initializeHelpButton(canvas);
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
    initializeContainers(this);
  }

  private initializeTooltip(canvas: HTMLCanvasElement): void {
    this.tooltipDiv = initializeTooltipOverlay(canvas, this.domContainer);
  }

  /** Create a top-right help button with hover panel explaining interactions */
  private initializeHelpButton(canvas: HTMLCanvasElement): void {
    const { button, panel } = initializeHelpOverlay(canvas, this.domContainer);
    this.helpButtonEl = button;
    this.helpPanelEl = panel;
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

    const fileInfoMap = this.fileInfoMap as
      | Record<string, { name: string; fileName: string; kind: string; color: number }>
      | undefined;

    // Group notes by unique file IDs
    const fileInfos: Map<string, { info: { name: string; fileName: string; kind: string; color: number }; notes: NoteData[] }> = new Map();

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
        // Sort by kind priority: Reference first, then Comparison, then MIDI
        const kindOrder: Record<string, number> = {
          Reference: 0,
          Comparison: 1,
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
          return `<div style="margin-top:4px;display:flex;align-items:center;">${swatch}<span style="font-weight:500;">${info.kind}: ${info.name}</span></div>`;
        })
        .join("");
    }

    // Evaluation context (if any)
    const evalKind = note.evalSegmentKind;
    const isEval = note.isEvalHighlightSegment === true;
    // Determine file role (Reference/Comparison) if available
    let fileRole: string | null = null;
    if (note.fileId && this.fileInfoMap) {
      const fid = note.fileId as string;
      const info = this.fileInfoMap[fid];
      fileRole = info?.kind ?? null;
    }
    let evalLine = "";
    if (isEval) {
      if (evalKind === "intersection") {
        evalLine = `Matched overlap (Reference + Comparison blended)`;
      } else if (evalKind === "exclusive") {
        evalLine = `Matched exclusive (${fileRole ?? "Track"} part)`;
      } else if (evalKind === "ambiguous") {
        evalLine = `Ambiguous (same pitch, overlapped, not matched)<br/>Possible cause: near-onset but offset too different (length mismatch)`;
      }
    } else if (fileRole === "Reference" || fileRole === "Comparison") {
      // Prefer wording that indicates presence-only rather than a failure
      evalLine = `${fileRole} only`;
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
      <div style=\"margin-top:4px;color:rgba(255,255,255,0.9);\">Time: ${minStartTime.toFixed(2)}s - ${maxEndTime.toFixed(2)}s</div>
      <div style=\"color:rgba(255,255,255,0.9);\">Velocity: ${note.velocity.toFixed(2)}</div>
      ${evalLine ? `<div style=\"margin-top:4px;color:rgba(255,255,255,0.95);font-weight:600;\">${evalLine}</div>` : ""}
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
    const pinchState = { isPinching: false, lastDistance: 0, anchorX: 0 } as const as {
      isPinching: boolean;
      lastDistance: number;
      anchorX: number;
    };

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
      (event) => {
        if ((event.touches?.length ?? 0) >= 2) {
          pinchStart(event, this, pinchState);
        } else {
          onPointerDown(event, this);
        }
      },
      nonPassive
    );
    canvas.addEventListener(
      "touchmove",
      (event) => {
        if (pinchState.isPinching && (event.touches?.length ?? 0) >= 2) {
          pinchMove(event, this, pinchState);
        } else {
          onPointerMove(event, this);
        }
      },
      nonPassive
    );
    canvas.addEventListener(
      "touchend",
      (event) => {
        if (pinchState.isPinching) {
          pinchEnd(event, this, pinchState);
        } else {
          onPointerUp(event, this);
        }
      }
    );

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
    // Cancel any pending RAF to prevent duplicates
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    
    const now = performance.now();
    const timeSinceLastRender = now - this.lastRenderTime;
    
    if (timeSinceLastRender >= this.renderThrottleMs) {
      // Enough time has passed, render immediately
      this.lastRenderTime = now;
      this.render();
    } else {
      // Schedule render for the next frame
      this.performanceMetrics.skippedRenders++;
      const delay = this.renderThrottleMs - timeSinceLastRender;
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.lastRenderTime = performance.now();
        this.render();
      });
    }
  }

  /**
   * Full render of all components
   */
  public render(): void {
    // Performance monitoring start
    const renderStart = performance.now();
    
    // Update playhead first so that its computed X position is available
    // to background and note layers (e.g., pianoKeys shading uses playheadX).

    // Update mask for notes/sustains prior to drawing
    {
      const bandPadding = 6;
      const bandHeight = Math.max(
        24,
        Math.min(96, Math.floor(this.options.height * 0.22))
      );
      const reservedBottomPx = bandPadding + bandHeight;
      const usableHeight = Math.max(0, this.options.height - reservedBottomPx);
      this.notesMask.clear();
      this.notesMask.rect(0, 0, this.options.width, usableHeight);
      this.notesMask.fill({ color: 0xffffff, alpha: 1 });
    }

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
    
    // Performance monitoring end
    const renderEnd = performance.now();
    const renderTime = renderEnd - renderStart;
    this.performanceMetrics.renderCount++;
    this.performanceMetrics.totalRenderTime += renderTime;
    this.performanceMetrics.lastRenderTime = renderTime;
    
    if (renderTime > 16) { // More than one frame
      this.performanceMetrics.slowRenders++;
      console.warn(`[PianoRoll] Slow render: ${renderTime.toFixed(2)}ms`);
    }
    
    // Log every 100 renders
    if (this.performanceMetrics.renderCount % 100 === 0) {
      const avgTime = this.performanceMetrics.totalRenderTime / this.performanceMetrics.renderCount;
      // console.log(`[PianoRoll] Performance - Avg: ${avgTime.toFixed(2)}ms, Slow: ${this.performanceMetrics.slowRenders}/${this.performanceMetrics.renderCount}, Skipped: ${this.performanceMetrics.skippedRenders}`);
    }
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
    this.performanceMetrics.setTimeCount++;
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

    // Request render with throttling
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
    // Preserve the current time under the fixed playhead while resetting zoom.
    const currentTime = this.state.currentTime || 0;
    this.state.zoomX = 1;
    this.state.zoomY = 1;
    // Recompute panX so that `currentTime` remains under the playhead anchor
    const pxPerSecond = this.timeScale(1) * this.state.zoomX;
    this.state.panX = -currentTime * pxPerSecond;
    this.state.panY = 0;
    clampPanX(this.timeScale, this.state);
    clampPanY(this.pitchScale, this.state, this.options.height);
    // Geometry changes due to zoom reset require full redraw
    this.needsNotesRedraw = true;
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
