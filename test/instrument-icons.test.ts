import { describe, expect, it } from "vitest";

import { INSTRUMENT_ICONS, getInstrumentIcon } from "@/assets/instrument-icons";
import { InstrumentFamily } from "@/lib/midi/types";

const svgMarkupPattern = /^<svg[\s\S]*<\/svg>$/;

describe("instrument icon registry", () => {
  it("exposes SVG markup for every instrument family", () => {
    const families = Object.keys(INSTRUMENT_ICONS) as InstrumentFamily[];
    expect(families.length).toBeGreaterThan(0);

    families.forEach((family) => {
      const svg = getInstrumentIcon(family);
      expect(svgMarkupPattern.test(svg)).toBe(true);
      expect(svg.includes('width="24"')).toBe(true);
      expect(svg.includes('height="24"')).toBe(true);
    });
  });

  it("falls back to the 'others' icon for unknown families", () => {
    const fallback = INSTRUMENT_ICONS.others;
    expect(getInstrumentIcon("others")).toBe(fallback);
    expect(getInstrumentIcon("unknown" as InstrumentFamily)).toBe(fallback);
  });
});

