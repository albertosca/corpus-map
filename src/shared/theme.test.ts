import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "./theme";

/**
 * Metric 9 (size): the smallest territory name font must stay legible.
 * Canary: shrink `territoryFonts.small` below 12px in the theme and this
 * fails — proving the check reads the real theme, not a font the test
 * defines for itself.
 */
function pxSize(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  if (!match?.[1]) throw new Error(`no px size in font: ${font}`);
  return Number.parseFloat(match[1]);
}

describe("DEFAULT_THEME territory fonts", () => {
  it("keeps the smallest name font at or above 12px", () => {
    expect(pxSize(DEFAULT_THEME.territoryFonts.small)).toBeGreaterThanOrEqual(12);
  });

  it("orders the three classes strictly large > medium > small", () => {
    const large = pxSize(DEFAULT_THEME.territoryFonts.large);
    const medium = pxSize(DEFAULT_THEME.territoryFonts.medium);
    const small = pxSize(DEFAULT_THEME.territoryFonts.small);
    expect(large).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(small);
  });
});
