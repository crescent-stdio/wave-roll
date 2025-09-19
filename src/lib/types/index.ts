/**
 * Onset marker shape identifiers used in the piano-roll overlay.
 */
export type OnsetMarkerShape =
  | "circle"
  | "square"
  | "diamond"
  | "triangle-up"
  | "triangle-down"
  | "triangle-left"
  | "triangle-right"
  | "star"
  | "cross"
  | "plus"
  | "hexagon"
  | "pentagon"
  | "chevron-up"
  | "chevron-down";

/**
 * Visual style for an onset marker.
 * Color is derived from the file's color; not stored here.
 */
export interface OnsetMarkerStyle {
  shape: OnsetMarkerShape;
  variant: "filled" | "outlined";
  /** Preferred pixel size for the marker (renderer may clamp to row height). */
  size: number;
  /** Outline stroke width in pixels. */
  strokeWidth: number;
}


