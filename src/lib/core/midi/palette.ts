import { ColorPalette } from "./types";

/**
 * Default color palettes
 */
export const DEFAULT_PALETTES: ColorPalette[] = [
  {
    id: "vibrant",
    name: "Vibrant",
    colors: [
      0x4285f4, // Blue
      0xea4335, // Red
      0xfbbc04, // Yellow
      0x34a853, // Green
      0x9c27b0, // Purple
      0xff6f00, // Orange
      0x00bcd4, // Cyan
      0xe91e63, // Pink
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
