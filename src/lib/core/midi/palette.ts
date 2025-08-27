import { ColorPalette } from "./types";

export const DEFAULT_PALETTE_ID = "vibrant";
/**
 * Default color palettes
 */
export const DEFAULT_PALETTES: ColorPalette[] = [
  {
    id: "vibrant",
    name: "Vibrant (Accessible)",
    // CVD-friendly, dark-enough hues that maintain >= 3:1 contrast
    // against light surfaces (e.g., #f1f5f9) for non-text graphics.
    colors: [
      0x2563eb, // Blue-600
      0xea580c, // Orange-600
      0x15803d, // Green-700
      0xb91c1c, // Red-700
      0x7c3aed, // Violet-600
      0x0f766e, // Teal-700
      0x0369a1, // Cyan-700
      0xa21caf, // Fuchsia-700
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
