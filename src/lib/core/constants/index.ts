// Accessible, higher-contrast defaults (WCAG AA targets)
export const COLOR_PRIMARY = "#2563eb"; // Blue-600: ensures white-on-accent >= 4.5:1
// Unify A/B marker color with piano-roll loop line colors for consistency
export const COLOR_A = "#0ea5e9"; // Sky-500 (A) - matched with loop line A
export const COLOR_B = "#e11d48"; // Rose-600 (B) - matched with loop line B

export const COLOR_OVERLAP = "#64748b"; // Slate-500: neutral highlight base for overlaps

// Single colors for evaluation highlight modes (no per-file blending)
// Evaluation highlight colours (soft, eye‑friendly)
// Intersection/Match → soft blue, Exclusive/Difference → soft rose
export const COLOR_EVAL_HIGHLIGHT = "#60A5FA"; // Sky-400
export const COLOR_EVAL_EXCLUSIVE = "#FB7185"; // Rose-400
// Ambiguous color is now dynamically generated based on REF and COMP colors

// Gray mode distinct levels for better separation
export const GRAY_EVAL_INTERSECTION = "#B0B0B0"; // Light gray for intersection
export const GRAY_EVAL_EXCLUSIVE = "#707070"; // Medium gray for exclusive  
export const GRAY_EVAL_AMBIGUOUS = "#7A6F66"; // Warm gray for ambiguous (distinct)

export const SUSTAIN_ALPHA = 0.2;
export const SUSTAIN_CONTROLLER = 64;

// Waveform + Playhead
export const COLOR_WAVEFORM = "#475569"; // Slate-600: neutral, high-contrast waveform stroke
export const COLOR_PLAYHEAD = "#0f172a"; // Slate-900: near-black core for maximum contrast
export const COLOR_PLAYHEAD_OUTLINE = "#ffffff"; // White halo to ensure contrast over waveform/grid

// Loop A/B markers & region
export const COLOR_LOOP_SHADE = "#fde68a"; // Amber-300: warm but light region fill for A-B
export const COLOR_LOOP_LINE_A = "#0ea5e9"; // Sky-500: reserved for A-line (distinct from palette)
export const COLOR_LOOP_LINE_B = "#e11d48"; // Rose-600: reserved for B-line (distinct from palette)

// ---------------------------------------------------------------------------
// Tempo / Playback Defaults
// ---------------------------------------------------------------------------
/**
 * Default baseline tempo (BPM) used when MIDI does not provide an initial tempo.
 */
export const DEFAULT_BASELINE_TEMPO = 120;

// ---------------------------------------------------------------------------
// Onset marker shapes and defaults
// ---------------------------------------------------------------------------
/**
 * Ordered list of primary marker shapes for first-pass unique assignment.
 */
export const ONSET_MARKER_SHAPES: Array<
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
  | "chevron-down"
> = [
  "circle",
  "square",
  "diamond",
  "triangle-up",
  "triangle-down",
  "triangle-left",
  "triangle-right",
  "star",
  "cross",
  "plus",
  "hexagon",
  "pentagon",
  "chevron-up",
  "chevron-down",
];

/** Maximum number of unique visual combinations before reuse kicks in. */
export const MAX_UNIQUE_MARKERS = ONSET_MARKER_SHAPES.length * 2; // filled + outlined