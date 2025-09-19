import * as PIXI from "pixi.js";
import type { PianoRoll } from "../piano-roll";

/**
 * Initialize Pixi containers and display list for the piano roll instance.
 * Keeps layering/zIndex contracts identical to the original inline method.
 */
export function initializeContainers(pr: PianoRoll): void {
  // Main container for all elements
  pr.container = new PIXI.Container();
  pr.container.sortableChildren = true; // Enable z-index sorting
  pr.app.stage.addChild(pr.container);

  // Background grid container
  pr.backgroundGrid = new PIXI.Graphics();
  pr.backgroundGrid.zIndex = 1;
  pr.container.addChild(pr.backgroundGrid);

  // Waveform layer (below grid)
  pr.waveformLayer = new PIXI.Graphics();
  pr.waveformLayer.zIndex = 0;
  pr.container.addChild(pr.waveformLayer);

  // Waveform layer shown above piano-keys fill so it is visible left of playhead
  pr.waveformKeysLayer = new PIXI.Graphics();
  // Keep it below notes and loop overlays, but above background grid fill
  // Use the same zIndex as labels but add before them so labels stay on top
  pr.waveformKeysLayer.zIndex = 2;
  pr.container.addChild(pr.waveformKeysLayer);

  // Container for time grid labels (kept separate to avoid addChild on Graphics)
  pr.backgroundLabelContainer = new PIXI.Container();
  pr.backgroundLabelContainer.zIndex = 2;
  pr.container.addChild(pr.backgroundLabelContainer);

  // Notes container for all note rectangles
  pr.notesContainer = new PIXI.Container();
  pr.notesContainer.zIndex = 10;
  pr.container.addChild(pr.notesContainer);

  // Mask that clips out the bottom waveform band area from the notes/sustains
  pr.notesMask = new PIXI.Graphics();
  pr.container.addChild(pr.notesMask);
  pr.notesContainer.mask = pr.notesMask;

  pr.sustainContainer = new PIXI.Container();
  pr.sustainContainer.zIndex = 5;
  pr.container.addChild(pr.sustainContainer);
  // Apply same mask so sustain overlays also avoid the waveform area
  pr.sustainContainer.mask = pr.notesMask;

  // Overlay for sustain pedal (below notes to avoid covering them)
  pr.sustainOverlay = new PIXI.Graphics();
  pr.sustainOverlay.zIndex = -10; // ensure below note sprites
  pr.sustainContainer.addChild(pr.sustainOverlay);

  // Playhead line (always on top)
  pr.playheadLine = new PIXI.Graphics();
  pr.playheadLine.zIndex = 1000;
  pr.container.addChild(pr.playheadLine);

  // Overlay for loop window
  pr.loopOverlay = new PIXI.Graphics();
  pr.loopOverlay.zIndex = 500; // below playhead but above notes
  pr.container.addChild(pr.loopOverlay);

  // Overlay for multi-track overlaps (semi-transparent red)
  pr.overlapOverlay = new PIXI.Graphics();
  pr.overlapOverlay.zIndex = 20; // above grid, below notes
  pr.container.addChild(pr.overlapOverlay);

  // Container for loop A/B labels
  pr.loopLabelContainer = new PIXI.Container();
  pr.loopLabelContainer.zIndex = 600; // alongside loop lines
  pr.container.addChild(pr.loopLabelContainer);

  // Vertical lines for A (start) and B (end)
  const startLine = new PIXI.Graphics();
  const endLine = new PIXI.Graphics();
  startLine.zIndex = 600;
  endLine.zIndex = 600;
  pr.container.addChild(startLine);
  pr.container.addChild(endLine);
  pr.loopLines = { start: startLine, end: endLine };
}


