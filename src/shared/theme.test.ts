import { describe, expect, it } from "vitest";
import { contrastRatio, over, parseColor } from "../labels/contrast";
import { TERRITORY_OUTLINE_WIDTH } from "../territories/paintTerritories";
import { DARK_THEME, DEFAULT_THEME } from "./theme";

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

describe.each([
  ["light", DEFAULT_THEME],
  ["dark", DARK_THEME],
] as const)("%s territory fonts", (_name, theme) => {
  it("keeps the smallest name font at or above 12px", () => {
    expect(pxSize(theme.territoryFonts.small)).toBeGreaterThanOrEqual(12);
  });

  it("orders the three classes strictly large > medium > small", () => {
    const large = pxSize(theme.territoryFonts.large);
    const medium = pxSize(theme.territoryFonts.medium);
    const small = pxSize(theme.territoryFonts.small);
    expect(large).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(small);
  });
});

/**
 * WCAG 2.2 SC 1.4.11 (non-text contrast): the keyboard focus outline drawn on
 * the canvas must reach 3:1 against what it is drawn over. The canvas itself
 * is transparent, so "the map background" is the host page's: checked against
 * the theme's own pages (white and the demo's #f7f7f8 for light, #18181b and
 * #111114 for dark), bare and under every palette fill (the outline straddles
 * the fill's edge), computed from the theme's actual colours rather than
 * asserted by hand.
 */
describe.each([
  ["light", DEFAULT_THEME, ["#ffffff", "#f7f7f8"]],
  ["dark", DARK_THEME, ["#18181b", "#111114"]],
] as const)("%s focus outline", (_name, theme, pages) => {
  it("reaches at least 3:1 against the page, bare and under every territory fill", () => {
    const outline = parseColor(theme.focusOutline);
    expect(outline[3], "an opaque outline, so its contrast does not depend on what is under it").toBe(1);
    for (const page of pages) {
      const background = parseColor(page);
      expect(contrastRatio(outline, background), `against ${page}`).toBeGreaterThanOrEqual(3);
      for (const colour of theme.palette) {
        const [red, green, blue] = parseColor(colour);
        const underFill = over([red, green, blue, theme.territoryFillAlpha], background);
        expect(contrastRatio(outline, underFill), `${colour} over ${page}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("is wider than a territory outline, so it reads as a distinct ring", () => {
    expect(theme.focusOutlineWidth).toBeGreaterThan(TERRITORY_OUTLINE_WIDTH);
  });
});

it("no longer carries the fields slice D replaced", () => {
  for (const field of ["territoryFill", "territoryStroke", "visited", "unvisited"]) {
    expect(DEFAULT_THEME).not.toHaveProperty(field);
    expect(DARK_THEME).not.toHaveProperty(field);
  }
});
