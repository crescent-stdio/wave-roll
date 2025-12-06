/**
 * SVG Icons for instrument families
 * Used in Settings UI to visually distinguish track types
 *
 * Design System:
 * - Base Grid: 24x24 viewBox
 * - Style: Lucide/Feather (clean lines, rounded corners)
 * - Attributes: stroke="currentColor", stroke-width="2", fill="none"
 *
 * 16px Readability Heuristics:
 * - Piano: compact keyboard with three clear black-key blocks
 * - Strings: violin silhouette with paired f-holes and vertical strings
 * - Drums: single shell + lid with one diagonal stick
 * - Guitar: circular body plus angled neck with tuning nubs
 * - Bass: offset body with long neck, bridge rails, and tuning dots
 * - Synth: rack with two knobs plus three grouped keys
 * - Winds: horizontal flute pill, mouthpiece, and three tone holes
 * - Brass: flared trumpet bell, short lead pipe, and two valves
 * - Vocal: microphone with singing figure silhouette
 * - Organ: pipe organ with vertical pipes
 * - Mallet: maracas percussion instrument
 * - Others: generic musical note retained for catch-all usage
 */

import { InstrumentFamily } from "@/lib/midi/types";

/** Common SVG attributes for consistent styling */
const SVG_ATTRS = `width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"`;

/**
 * SVG icons for each instrument family.
 * All icons use 24x24 viewBox with Lucide/Feather styling.
 */
export const INSTRUMENT_ICONS: Record<InstrumentFamily, string> = {
  // Piano: keyboard piano keys play (from SVG Repo)
  piano: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" style="pointer-events: none;">
    <rect x="3" y="4" width="26" height="24"/>
    <line x1="9" y1="17" x2="9" y2="28"/>
    <rect x="6" y="4" width="4" height="13"/>
    <line x1="16" y1="17" x2="16" y2="28"/>
    <rect x="14" y="4" width="4" height="13"/>
    <line x1="23" y1="17" x2="23" y2="28"/>
    <rect x="22" y="4" width="4" height="13"/>
  </svg>`,

  // Strings: violin/cello with bow (from SVG Repo)
  strings: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <polygon points="8.1,25.4 6.6,23.9 8.9,20.1 11.9,23.1"/>
    <polygon points="24.5,6 26,7.5 17.1,17.9 14.1,14.9"/>
    <polygon points="26,7.5 24.5,6 26,3 29,6"/>
    <line x1="23.1" y1="4.5" x2="24.5" y2="6"/>
    <line x1="26" y1="7.5" x2="27.5" y2="8.9"/>
    <line x1="20.1" y1="6" x2="21.6" y2="7.5"/>
    <line x1="24.5" y1="10.4" x2="26" y2="11.9"/>
    <path d="M18.8,10.9c-2.4-1.4-5.6-1.1-7.6,1L11,12.1c0.6,1.2,0.4,2.6-0.6,3.6c-1.2,1.2-3.2,1.2-4.4,0.1c-0.3,0.2-0.6,0.4-0.8,0.7c-2.9,2.9-2.9,7.6,0,10.4c2.9,2.9,7.6,2.9,10.4,0c0.3-0.3,0.5-0.5,0.7-0.8c-1.2-1.2-1.2-3.2,0.1-4.4c1-1,2.4-1.2,3.6-0.6l0.1-0.1c2.1-2.1,2.4-5.2,1-7.6"/>
  </svg>`,

  // Drums: snare drum with stick (from SVG Repo)
  drums: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <path d="M4,17v8c0,2.2,5.4,4,12,4s12-1.8,12-4v-8"/>
    <line x1="13" y1="17" x2="29" y2="3"/>
    <ellipse cx="16" cy="17" rx="12" ry="4"/>
  </svg>`,

  // Guitar: classic guitar (from SVG Repo)
  guitar: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <path d="M20.4,24.8l1.5-3.9c0.4-1.1,1.3-2.1,2.4-2.7l0,0c3.2-1.7,3.7-6.1,1-8.8l-2.3-2.3c-2.7-2.7-7.1-2.2-8.8,1l0,0c-0.6,1.1-1.5,1.9-2.7,2.4l-3.9,1.5c-4.6,1.8-5.6,7.8-2,11.4L9,26.8C12.7,30.4,18.6,29.4,20.4,24.8z"/>
    <circle cx="18.2" cy="14.3" r="2.9"/>
    <line x1="9.7" y1="19.1" x2="13.4" y2="22.8"/>
    <polyline points="26.3,3.5 22.9,6.9 25.6,9.6 29,6.2"/>
  </svg>`,

  // Bass: electric bass guitar (from SVG Repo)
  bass: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <path d="M12.8,21.8L12.8,21.8c-1.7-1.4-2.3-3.8-1.5-5.9l4.1-10.7C16.3,3,19,2.3,20.8,3.8l0,0c1.4,1.2,1.6,3.3,0.5,4.7l-1.1,1.5l1.4,6.2c0.4,1.9-0.2,3.9-1.7,5.1l-0.4,0.4C17.5,23.4,14.7,23.4,12.8,21.8z"/>
    <line x1="14" y1="29" x2="14" y2="22.5"/>
    <line x1="19" y1="22.1" x2="19" y2="29"/>
    <line x1="9.6" y1="14.9" x2="11.4" y2="15.7"/>
    <line x1="10.6" y1="11.9" x2="12.5" y2="12.8"/>
    <line x1="11.6" y1="8.9" x2="13.6" y2="9.8"/>
    <line x1="12.6" y1="5.9" x2="14.8" y2="6.9"/>
  </svg>`,

  // Synth: keyboard piano synth midi vst (from SVG Repo)
  synth: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" style="pointer-events: none;">
    <rect x="3" y="13" width="26" height="16"/>
    <line x1="9" y1="21" x2="9" y2="29"/>
    <rect x="6" y="13" width="4" height="8"/>
    <line x1="16" y1="21" x2="16" y2="29"/>
    <rect x="14" y="13" width="4" height="8"/>
    <line x1="23" y1="21" x2="23" y2="29"/>
    <rect x="22" y="13" width="4" height="8"/>
    <rect x="3" y="3" width="26" height="10"/>
    <rect x="7" y="6" width="10" height="4"/>
    <circle cx="23" cy="8" r="2"/>
  </svg>`,

  // Winds: flute instrument (from SVG Repo)
  winds: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <path d="M26.5,10h-21C4.7,10,4,9.3,4,8.5v0C4,7.7,4.7,7,5.5,7h21C27.3,7,28,7.7,28,8.5v0C28,9.3,27.3,10,26.5,10z"/>
    <polyline points="10,10 10,29 6,29 6,10.1"/>
    <polyline points="6,7 6,3 10,3 10,7"/>
    <polyline points="10,7 10,3 14,3 14,7"/>
    <polyline points="14,10 14,26 10,26 10,10"/>
    <polyline points="14,7 14,3 18,3 18,7"/>
    <polyline points="18,10 18,23 14,23 14,10"/>
    <polyline points="18,7 18,3 22,3 22,7"/>
    <polyline points="22,10 22,20 18,20 18,10"/>
    <polyline points="22,7 22,3 26,3 26,7"/>
    <polyline points="26,10 26,17 22,17 22,10"/>
  </svg>`,

  // Brass: jazz trumpet band (from SVG Repo)
  brass: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <path d="M29,9L29,9c-1.9,3.1-5.2,5-8.8,5H7l0,0c-0.6-0.6-1.5-1-2.4-1h0C3.7,13,3,13.7,3,14.6v2.8C3,18.3,3.7,19,4.6,19h0c0.9,0,1.8-0.4,2.4-1l0,0h13.2c3.6,0,7,1.9,8.8,5l0,0V9z"/>
    <path d="M17.5,23h-6C10.1,23,9,21.9,9,20.5v0c0-1.4,1.1-2.5,2.5-2.5h6c1.4,0,2.5,1.1,2.5,2.5v0C20,21.9,18.9,23,17.5,23z"/>
    <line x1="29" y1="8" x2="29" y2="24"/>
    <line x1="11" y1="11" x2="11" y2="11"/>
    <line x1="14" y1="11" x2="14" y2="11"/>
    <line x1="17" y1="11" x2="17" y2="11"/>
  </svg>`,

  // Vocal: microphone with singing figure (from SVG Repo)
  vocal: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <path d="M7.6,12c2.1,2.1,4.7,1.3,6.7-0.7s2.8-4.7,0.7-6.7s-5.4-2.1-7.5,0S5.5,9.9,7.6,12z"/>
    <path d="M6.8,11c1.7,0.3,3.5-0.6,5-2.1c1.5-1.5,2.4-3.3,2.1-5"/>
    <path d="M16.3,7.3c4.8,5,9.3,11.3,10.1,14.3l-1.7,1.7c-3-0.7-9.3-5.3-14.3-10.1"/>
    <line x1="16.9" y1="14" x2="17.8" y2="14.9"/>
    <path d="M8.4,21.5L8.4,21.5c1.5-2,4.5-2.3,6.4-0.7l8.6,7.5c1.1,0.9,2.7,0.9,3.8-0.1l0,0c1.1-1.1,1.1-2.8,0-3.9l-1.8-1.8"/>
  </svg>`,

  // Organ: pipe organ with vertical pipes (stroke style)
  organ: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <rect x="4" y="22" width="24" height="7"/>
    <line x1="8" y1="22" x2="8" y2="8"/>
    <line x1="12" y1="22" x2="12" y2="5"/>
    <line x1="16" y1="22" x2="16" y2="3"/>
    <line x1="20" y1="22" x2="20" y2="5"/>
    <line x1="24" y1="22" x2="24" y2="8"/>
    <circle cx="8" cy="7" r="1.5"/>
    <circle cx="12" cy="4" r="1.5"/>
    <circle cx="16" cy="2" r="1.5"/>
    <circle cx="20" cy="4" r="1.5"/>
    <circle cx="24" cy="7" r="1.5"/>
  </svg>`,

  // Mallet: maracas percussion (from SVG Repo)
  mallet: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
    <path d="M13.6,26l-3-12.2c1.9-1,3-3.5,2.5-6.1C12.5,4.6,10,2.5,7.4,3C4.8,3.5,3.2,6.4,3.8,9.5c0.5,2.6,2.4,4.5,4.5,4.8l1.8,12.5c0.1,1,1.1,1.7,2.1,1.5C13.2,28,13.8,27,13.6,26z"/>
    <path d="M3.8,9.5L3.8,9.5c3.2,0.6,6.6,0,9.4-1.8l0,0"/>
    <path d="M24.5,5C22,4.5,19.6,6.5,19,9.5c-0.5,2.5,0.6,4.9,2.4,5.8l-2.8,11.7c-0.3,0.9,0.4,1.9,1.3,2.1s1.9-0.5,2-1.5l1.7-11.9c2-0.2,3.8-2.1,4.3-4.5C28.5,8.2,27,5.4,24.5,5z"/>
    <path d="M27.9,11.2L27.9,11.2c-3.1,0.6-6.3,0-8.9-1.7l0,0"/>
  </svg>`,

  // Others: scores notes audio (from SVG Repo)
  others: `<svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" style="pointer-events: none;">
    <ellipse cx="18" cy="24" rx="4" ry="3"/>
    <path d="M22,24V5l0.4,0.8C23.4,7.9,25,9.7,27,11l0,0c1.7,1.1,2.1,3.3,1,5l0,0"/>
    <line x1="3" y1="26" x2="10" y2="26"/>
    <line x1="3" y1="21" x2="10" y2="21"/>
    <line x1="3" y1="16" x2="17" y2="16"/>
    <line x1="3" y1="11" x2="17" y2="11"/>
    <line x1="3" y1="6" x2="17" y2="6"/>
  </svg>`,
};

/**
 * Get the SVG icon for a given instrument family.
 * @param family - The instrument family
 * @returns SVG string for the icon
 */
export function getInstrumentIcon(family: InstrumentFamily): string {
  return INSTRUMENT_ICONS[family] ?? INSTRUMENT_ICONS.others;
}

/**
 * Chevron icon for accordion expand/collapse
 */
export const CHEVRON_DOWN = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none; transition: transform 0.2s;">
  <path d="M6 9l6 6 6-6" />
</svg>`;

export const CHEVRON_RIGHT = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none; transition: transform 0.2s;">
  <path d="M9 6l6 6-6 6" />
</svg>`;
