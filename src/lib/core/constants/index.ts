// Accessible, higher-contrast defaults (WCAG AA targets)
export const COLOR_PRIMARY = "#2563eb"; // Blue-600: ensures white-on-accent >= 4.5:1
// Unify A/B marker color with piano-roll loop line colors for consistency
export const COLOR_A = "#0ea5e9"; // Sky-500 (A) — matched with loop line A
export const COLOR_B = "#e11d48"; // Rose-600 (B) — matched with loop line B

export const COLOR_OVERLAP = "#64748b"; // Slate-500: neutral highlight base for overlaps

// Single colors for evaluation highlight modes (no per-file blending)
export const COLOR_EVAL_HIGHLIGHT = "#FFD966"; // Amber/yellow for high-contrast highlight
export const COLOR_EVAL_EXCLUSIVE = "#FFB74D"; // Optional: distinct tone for exclusive segments

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
