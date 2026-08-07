import { describe, expect, it } from "vitest";

import { PLAYER_ICONS } from "@/assets/player-icons";
import { ICON_SIZE } from "@/assets/icon-utils";

const svgMarkupPattern = /^<svg[\s\S]*<\/svg>$/;

/**
 * `est` is still authored with <text>. It has no call site anywhere in src/,
 * so the pictogram pass left it untouched rather than inventing a meaning for
 * it. Every other icon must stay font-independent.
 */
const TEXT_EXEMPT = new Set(["est"]);

describe("player icon registry", () => {
  it("normalizes every icon to the shared render contract", () => {
    const entries = Object.entries(PLAYER_ICONS);
    expect(entries.length).toBeGreaterThan(0);

    entries.forEach(([name, svg]) => {
      expect(svgMarkupPattern.test(svg), `${name} must be a bare <svg> element`).toBe(true);
      // Assert the normalized contract, not the raw asset's authored size
      expect(svg).toContain(`width="${ICON_SIZE}"`);
      expect(svg).toContain(`height="${ICON_SIZE}"`);
      expect(svg).toContain("currentColor");
    });
  });

  it("draws icons as vector shapes rather than font-dependent text", () => {
    Object.entries(PLAYER_ICONS)
      .filter(([name]) => !TEXT_EXEMPT.has(name))
      .forEach(([name, svg]) => {
        expect(svg.includes("<text"), `${name} must not rely on <text>`).toBe(false);
      });
  });
});
