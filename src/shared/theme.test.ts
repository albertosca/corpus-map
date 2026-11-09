import { describe, expect, it } from "vitest";
import { contrastRatio, over, parseColor } from "../labels/contrast";
import { UNVISITED_RING_WIDTH } from "../points/paintPoints";
import { GROUP_OUTLINE_WIDTH, TERRITORY_OUTLINE_WIDTH } from "../territories/paintTerritories";
import { DARK_THEME, DEFAULT_THEME } from "./theme";
import { DEFAULT_TUNING } from "./tuning";

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

/**
 * The selection ring (spec slice C §5) is held to the same WCAG 2.2 SC 1.4.11
 * bar as the focus outline: 3:1 against every page, bare and under every
 * territory fill, for the colour actually drawn (`selectionRing`, else
 * `territoryLabel`).
 */
describe.each([
  ["light", DEFAULT_THEME, ["#ffffff", "#f7f7f8"]],
  ["dark", DARK_THEME, ["#18181b", "#111114"]],
] as const)("selection ring clears 3:1 (%s)", (_name, theme, pages) => {
  it("reaches at least 3:1 against the page, bare and under every territory fill", () => {
    const ring = parseColor(theme.selectionRing ?? theme.territoryLabel);
    expect(ring[3], "an opaque ring, so its contrast does not depend on what is under it").toBe(1);
    for (const page of pages) {
      const background = parseColor(page);
      expect(contrastRatio(ring, background), `against ${page}`).toBeGreaterThanOrEqual(3);
      for (const colour of theme.palette) {
        const [red, green, blue] = parseColor(colour);
        const underFill = over([red, green, blue, theme.territoryFillAlpha], background);
        expect(contrastRatio(ring, underFill), `${colour} over ${page}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

it("no longer carries the fields slice D replaced", () => {
  for (const field of ["territoryFill", "territoryStroke", "visited", "unvisited"]) {
    expect(DEFAULT_THEME).not.toHaveProperty(field);
    expect(DARK_THEME).not.toHaveProperty(field);
  }
});

/**
 * The related-item line and neighbour ring (spec slice E §6) are held to the
 * focus outline's bar: 3:1 against every page, bare and under every palette
 * fill (family tints are checked in `theme.metrics.test.ts`).
 */
describe.each([
  ["light", DEFAULT_THEME, ["#ffffff", "#f7f7f8"]],
  ["dark", DARK_THEME, ["#18181b", "#111114"]],
] as const)("%s edge colour", (_name, theme, pages) => {
  it("reaches at least 3:1 against the page, bare and under every territory fill", () => {
    const edge = parseColor(theme.edge ?? theme.territoryLabel);
    expect(edge[3]).toBe(1);
    for (const page of pages) {
      const background = parseColor(page);
      expect(contrastRatio(edge, background), `against ${page}`).toBeGreaterThanOrEqual(3);
      for (const colour of theme.palette) {
        const [red, green, blue] = parseColor(colour);
        const underFill = over([red, green, blue, theme.territoryFillAlpha], background);
        expect(contrastRatio(edge, underFill), `${colour} over ${page}`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

/**
 * The selected card sits over the map, and item labels paint dark (or light)
 * plates on the canvas beneath it: a translucent card background lets that
 * text show through as ghost text (seen in the browser at 0.96 alpha). The
 * shared `cardBackground` therefore stays fully opaque in both themes.
 */
describe.each([
  ["light", DEFAULT_THEME],
  ["dark", DARK_THEME],
] as const)("%s card background", (_name, theme) => {
  it("is fully opaque so nothing painted beneath the card shows through", () => {
    expect(parseColor(theme.cardBackground)[3]).toBe(1);
  });
});

// Spec 2026-11-07-serious-default-design.md §2: the sober "ink and paper" default. These are the shipped values; the
// metric tests above and in theme.metrics.test.ts are what prove they are usable.
describe("the default look", () => {
  it("names upper case with a 0.6 px spacing, a 0.16 fill, 2.4 px points and an eight-colour palette", () => {
    expect(DEFAULT_THEME.territoryNameStyle).toEqual({ uppercase: true, spacing: 0.6 });
    expect(DEFAULT_THEME.territoryFillAlpha).toBe(0.16);
    expect(DEFAULT_THEME.pointRadius).toBe(2.4);
    expect(DEFAULT_THEME.palette).toHaveLength(8);
  });

  it("gives the dark theme the same name style, fill and point size, with its own palette", () => {
    expect(DARK_THEME.territoryNameStyle).toEqual(DEFAULT_THEME.territoryNameStyle);
    expect(DARK_THEME.territoryFillAlpha).toBe(DEFAULT_THEME.territoryFillAlpha);
    expect(DARK_THEME.pointRadius).toBe(DEFAULT_THEME.pointRadius);
    expect(DARK_THEME.palette).toHaveLength(8);
    expect(DARK_THEME.palette).not.toEqual(DEFAULT_THEME.palette);
  });

  it("draws a 1 px territory outline and a thinner family outline, still thinner than the keyboard focus ring", () => {
    expect(TERRITORY_OUTLINE_WIDTH).toBe(1);
    expect(GROUP_OUTLINE_WIDTH).toBe(1.75);
    expect(GROUP_OUTLINE_WIDTH).toBeGreaterThan(TERRITORY_OUTLINE_WIDTH);
    expect(DEFAULT_THEME.focusOutlineWidth).toBeGreaterThan(GROUP_OUTLINE_WIDTH);
  });

  it("leaves a visible hole in the unvisited ring at 2.4 px, so it reads apart from the visited disc", () => {
    // The ring is stroked at radius - width / 2 with the full width, so the empty inside is radius - width.
    expect(DEFAULT_THEME.pointRadius - UNVISITED_RING_WIDTH).toBeGreaterThanOrEqual(0.5);
  });

  it("keeps the pointer hit radius at 12 px, so a smaller point is no smaller a target (WCAG 2.5.8, 24 px)", () => {
    expect(DEFAULT_TUNING.hoverRadius).toBeGreaterThanOrEqual(12);
  });
});
