import { describe, expect, it } from "vitest";
import { contrastRatio, over, parseColor } from "../labels/contrast";
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

/**
 * WCAG 2.2 SC 1.4.11 (non-text contrast): the keyboard focus outline drawn on
 * the canvas must reach 3:1 against what it is drawn over. The canvas itself
 * is transparent, so "the map background" is the host page's: checked against
 * white and against the demo's own page colour (#f7f7f8), bare and under a
 * territory's fill (the outline straddles the fill's edge), computed from the
 * theme's actual colours rather than asserted by hand.
 */
describe("DEFAULT_THEME focus outline", () => {
  const pages = ["#ffffff", "#f7f7f8"];

  it("reaches at least 3:1 against the map background, bare and under a territory fill", () => {
    const outline = parseColor(DEFAULT_THEME.focusOutline);
    expect(outline[3], "an opaque outline, so its contrast does not depend on what is under it").toBe(1);
    for (const page of pages) {
      const bg = parseColor(page);
      const underFill = over(parseColor(DEFAULT_THEME.territoryFill), bg);
      expect(contrastRatio(outline, bg), `against ${page}`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(outline, underFill), `against the territory fill over ${page}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("is wider than the territory boundary's 1px stroke, so it reads as a distinct ring", () => {
    expect(DEFAULT_THEME.focusOutlineWidth).toBeGreaterThanOrEqual(2);
  });
});
