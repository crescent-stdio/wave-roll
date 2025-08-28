import { ColorPalette } from "./types";

export const DEFAULT_PALETTE_ID = "vibrant";
/**
 * Default color palettes
 */
export const DEFAULT_PALETTES: ColorPalette[] = [
  {
    id: "default",
    name: "Default",
    /**
     * Tableau‑inspired, eye‑friendly set with varied luminance.
     * Chosen for low eye‑strain and clear mutual separation.
     */
    colors: [
      0x4e79a7, // Blue
      0xf28e2b, // Orange
      0x59a14f, // Green
      0xe15759, // Red
      0xb07aa1, // Purple
      0x76b7b2, // Teal
      0xedc948, // Mustard
      0x9c755f, // Brown
    ],
  },
  {
    id: "vibrant",
    name: "Vibrant (Accessible)",
    /**
     * Okabe–Ito 8‑color palette (CVD‑safe) with varied luminance.
     * Order alternates lighter/darker tones to improve adjacency legibility.
     * Reference: Okabe & Ito (2008), widely used for color vision deficiency.
     */
    colors: [
      0xb91c1c, // Red (dark)  — 1
      0x3b82f6, // Blue (brighter) — 2
      0x0d9488, // Teal (darker, higher legibility) — 3
      0x009e73, // Bluish green (dark)
      0xcc79a7, // Reddish purple (medium)
      0x2c7fb8, // Sky blue (darker)
      0xb35c00, // Burnt orange (darker)
      0x000000, // Black (very dark)
    ],
  },
  {
    id: "pastel",
    name: "Pastel",
    colors: [
      0xaec6cf, // Pastel Blue
      0xffb3ba, // Pastel Red
      0xffffba, // Pastel Yellow
      0xbaffc9, // Pastel Green
      0xe0bbe4, // Pastel Purple
      0xffd8b1, // Pastel Orange
      0xb5ead7, // Pastel Mint
      0xffc0cb, // Pastel Pink
    ],
  },
  {
    id: "monochrome",
    name: "Monochrome",
    colors: [
      0x212121, // Black
      0x424242, // Dark Gray
      0x616161, // Gray
      0x757575, // Medium Gray
      0x9e9e9e, // Light Gray
      0xbdbdbd, // Lighter Gray
      0xe0e0e0, // Very Light Gray
      0xeeeeee, // Near White
    ],
  },
];
