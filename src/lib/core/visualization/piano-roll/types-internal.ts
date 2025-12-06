// Internal types for PianoRoll renderer-side augmentation.
// These are intentionally not exported via the public API barrel to avoid
// leaking renderer implementation details.
import type * as PIXI from "pixi.js";

export interface FileInfo {
  name: string;
  fileName: string;
  kind: string; // e.g., "Reference" | "Comparison" | "MIDI"
  color: number; // hex number compatible with PixiJS tint
  /** Track info for tooltip display (id -> name mapping) */
  tracks?: Array<{ id: number; name: string }>;
}

export type FileInfoMap = Record<string, FileInfo>;

export interface PianoRollAugments {
  // Sprite caches used by renderers
  patternSprites?: PIXI.TilingSprite[];
  hatchSprites?: PIXI.TilingSprite[];
  onsetSprites?: PIXI.Sprite[];

  // Per-file colour map and highlight configuration
  fileColors?: Record<string, number>;
  highlightMode?: string;
  showOnsetMarkers?: boolean;
  // Per-file onset marker styles
  onsetStyles?: Record<string, import("@/types").OnsetMarkerStyle>;

  // Original (unsegmented) MIDI onset lookup to filter markers
  originalOnsetMap?: Record<string, number>;
  onlyOriginalOnsets?: boolean;

  // Tooltip metadata per file
  fileInfoMap?: FileInfoMap;
}
