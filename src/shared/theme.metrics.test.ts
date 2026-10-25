import { describe, expect, it } from "vitest";
import { ciede2000, simulate, type VisionMode } from "../../test/colourVision";
import { contrastRatio, over, parseColor, type Rgba } from "../labels/contrast";
import { tintDirection } from "../territories/familyColours";
import { TINT_STEPS, tint, tintBand } from "../territories/tint";
import { DENSE_FILL_FACTOR, DENSE_NAME_ALPHA } from "./presentation";
import { DARK_THEME, DEFAULT_THEME, type Theme } from "./theme";

const THEMES: Array<[string, Theme, string[]]> = [
  ["light", DEFAULT_THEME, ["#ffffff", "#f7f7f8"]],
  ["dark", DARK_THEME, ["#18181b", "#111114"]],
];

/** Every background a point or a name can sit on: the page, bare or under one territory's fill. */
function backgrounds(theme: Theme, page: Rgba, fillAlpha: number): Rgba[] {
  return [page, ...theme.palette.map((colour) => over(withAlpha(parseColor(colour), fillAlpha), page))];
}

function withAlpha(colour: Rgba, alpha: number): Rgba {
  return [colour[0], colour[1], colour[2], alpha];
}

describe.each(THEMES)("%s theme", (_name, theme, pages) => {
  const fillAlphas = [theme.territoryFillAlpha, theme.territoryFillAlpha * DENSE_FILL_FACTOR];

  it("metric 15: every palette colour and the neutral, as a point, reach 3:1 against what is beneath", () => {
    for (const page of pages.map(parseColor)) {
      for (const fillAlpha of fillAlphas) {
        for (const background of backgrounds(theme, page, fillAlpha)) {
          for (const colour of [...theme.palette, theme.pointNeutral]) {
            expect(
              contrastRatio(parseColor(colour), background),
              `${colour} at fill ${fillAlpha}`,
            ).toBeGreaterThanOrEqual(3);
          }
        }
      }
    }
  });

  it("metric 15 and 16 hold for every family tint of every palette colour (spec slice E §5)", () => {
    const direction = tintDirection(theme);
    const band = tintBand(theme.palette, direction);
    const tints = theme.palette.flatMap((colour) => TINT_STEPS.map((step) => tint(colour, step, direction, band)));
    const label = parseColor(theme.territoryLabel);
    for (const page of pages.map(parseColor)) {
      for (const fillAlpha of fillAlphas) {
        const beneath = [page, ...tints.map((colour) => over(withAlpha(parseColor(colour), fillAlpha), page))];
        for (const background of beneath) {
          for (const colour of tints)
            expect(
              contrastRatio(parseColor(colour), background),
              `${colour} at fill ${fillAlpha}`,
            ).toBeGreaterThanOrEqual(3);
          if (fillAlpha === theme.territoryFillAlpha)
            expect(contrastRatio(over(label, background), background)).toBeGreaterThanOrEqual(4.5);
          for (const outline of [theme.focusOutline, theme.selectionRing ?? theme.territoryLabel])
            expect(contrastRatio(parseColor(outline), background), `${outline} over a tint`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("metric 16: territory names reach 4.5:1 over the strongest fill, guided and dense", () => {
    const label = parseColor(theme.territoryLabel);
    for (const page of pages.map(parseColor)) {
      for (const background of backgrounds(theme, page, theme.territoryFillAlpha)) {
        expect(contrastRatio(over(label, background), background)).toBeGreaterThanOrEqual(4.5);
      }
      for (const background of backgrounds(theme, page, theme.territoryFillAlpha * DENSE_FILL_FACTOR)) {
        const muted = over(withAlpha(label, label[3] * DENSE_NAME_ALPHA), background);
        expect(contrastRatio(muted, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("metric 17: every palette pair stays at least ΔE00 9 apart in normal vision and three colour-vision deficiencies", () => {
    const modes: VisionMode[] = ["normal", "protanopia", "deuteranopia", "tritanopia"];
    for (const mode of modes) {
      const seen = theme.palette.map((colour) => simulate(parseColor(colour), mode));
      for (const [index, first] of seen.entries()) {
        for (const second of seen.slice(index + 1)) {
          expect(ciede2000(first, second), mode).toBeGreaterThanOrEqual(9);
        }
      }
    }
  });

  it("keeps the palette opaque and between 2 and 10 colours", () => {
    expect(theme.palette.length).toBeGreaterThanOrEqual(2);
    expect(theme.palette.length).toBeLessThanOrEqual(10);
    for (const colour of theme.palette) expect(parseColor(colour)[3]).toBe(1);
  });
});

describe("colour-vision helper", () => {
  it("leaves a colour unchanged in normal vision and measures identical colours as 0 apart", () => {
    const colour = parseColor("#003c96");
    expect(simulate(colour, "normal")).toEqual(colour);
    expect(ciede2000(colour, colour)).toBe(0);
  });

  it("collapses red and green under deuteranopia far more than in normal vision", () => {
    const red = parseColor("#cc0000");
    const green = parseColor("#00aa00");
    const normal = ciede2000(red, green);
    const deuteranopia = ciede2000(simulate(red, "deuteranopia"), simulate(green, "deuteranopia"));
    expect(deuteranopia).toBeLessThan(normal / 2);
  });
});
