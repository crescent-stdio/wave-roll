// Internal types for PianoRoll renderer-side augmentation.
// These are intentionally not exported via the public API barrel to avoid
// leaking renderer implementation details.
import type * as PIXI from "pixi.js";

export interface FileInfo {
  displayName: string;
  fileName: string;
  kind: string; // e.g., "Reference" | "Comparison" | "MIDI"
  color: number; // hex number compatible with PixiJS tint
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

  // Original (unsegmented) MIDI onset lookup to filter markers
  originalOnsetMap?: Record<string, number>;
  onlyOriginalOnsets?: boolean;

  // Tooltip metadata per file
  fileInfoMap?: FileInfoMap;
}
