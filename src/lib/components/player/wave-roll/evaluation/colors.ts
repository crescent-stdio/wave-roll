import { COLOR_EVAL_HIGHLIGHT, COLOR_EVAL_EXCLUSIVE } from "@/lib/core/constants";
import { getContrastingGray } from "@/lib/core/visualization/color-utils";

// Color helpers and constants extracted from evaluation-handler.ts

export function toNumberColor(c: string | number): number {
  return typeof c === "number" ? c : parseInt(c.replace("#", ""), 16);
}

// Internal helpers kept for parity with original logic
function srgbToLin(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relLum(hex: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(a: number, b: number): number {
  const L1 = relLum(a), L2 = relLum(b);
  const lighter = Math.max(L1, L2) + 0.05;
  const darker = Math.min(L1, L2) + 0.05;
  return lighter / darker;
}

// Get a contrasting gray that ensures visibility against the base color
export function aaGrayFor(base: number): number {
  const baseHex = "#" + base.toString(16).padStart(6, "0");
  const grayHex = getContrastingGray(baseHex, 3.5);
  return parseInt(grayHex.replace("#", ""), 16);
}

// Derive a dynamic, high-contrast alternative without assuming fixed hues
export function complement(color: number): number {
  return (color ^ 0xffffff) >>> 0;
}

export const NEUTRAL_GRAY = 0x444444;
export const HIGHLIGHT_ANCHOR_REF = toNumberColor(COLOR_EVAL_HIGHLIGHT);
export const HIGHLIGHT_ANCHOR_EST = toNumberColor(COLOR_EVAL_EXCLUSIVE);
export const HIGHLIGHT_BLEND_RATIO = 0.75;


