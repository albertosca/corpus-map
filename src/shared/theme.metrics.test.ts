import { describe, expect, it } from "vitest";
import { parseColor } from "../labels/contrast";
import { checkTheme, type ThemeMetric } from "../theme-check/checkTheme";
import { ciede2000, simulate } from "../theme-check/colourVision";
import { DARK_THEME, DEFAULT_THEME, type Theme } from "./theme";

// The metrics themselves live in `checkTheme` (spec consumer-styles §4): the house themes and a consumer's theme go
// through the one function. What each metric measures is pinned by the deliberately bad themes in
// `theme-check/checkTheme.test.ts`; here the house themes must come back clean, one metric per test, on every page.
const THEMES: Array<[string, Theme, string[]]> = [
  ["light", DEFAULT_THEME, ["#ffffff", "#f7f7f8"]],
  ["dark", DARK_THEME, ["#18181b", "#111114"]],
];

const METRICS: Array<[ThemeMetric, string]> = [
  ["15", "every palette colour, the neutral and every family tint, as a point, reach 3:1 against what is beneath"],
  ["16", "names reach 4.5:1 over the guided, dense and visited-ceiling fills, on every colour and tint"],
  ["17", "every palette pair stays at least ΔE00 9 apart in normal vision and three colour-vision deficiencies"],
  ["focus", "the keyboard focus outline reaches 3:1 over the visited ceiling, on every palette colour and tint"],
  ["outline", "a territory outline reaches 3:1 over its own fill at the ceiling and 2.3:1 over a neighbour's"],
  ["ring", "the unvisited ring keeps a hole of at least 0.5 px"],
  ["palette", "the palette is opaque and between 2 and 10 colours"],
];

describe.each(THEMES)("%s theme", (_name, theme, pages) => {
  it.each(METRICS)("metric %s: %s", (metric) => {
    for (const page of pages)
      expect(checkTheme(theme, { page }).filter((problem) => problem.metric === metric)).toEqual([]);
  });

  it("passes every check on the page it derives for itself", () => {
    expect(checkTheme(theme)).toEqual([]);
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
