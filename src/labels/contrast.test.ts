import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "../shared/theme";
import { contrastRatio, isSupportedColour, over, parseColor } from "./contrast";

describe("metric 9 (contrast)", () => {
  it("territory names reach 4.5:1 over the territory fill on white", () => {
    const white = parseColor("#ffffff");
    const fill = over(parseColor(DEFAULT_THEME.territoryFill), white);
    const label = over(parseColor(DEFAULT_THEME.territoryLabel), fill);
    expect(contrastRatio(label, fill)).toBeGreaterThanOrEqual(4.5);
  });

  it("parses the notations the theme uses and rejects others", () => {
    expect(parseColor("#ff8000")).toEqual([255, 128, 0, 1]);
    expect(parseColor("rgb(1, 2, 3)")).toEqual([1, 2, 3, 1]);
    expect(parseColor("rgba(1,2,3,0.5)")).toEqual([1, 2, 3, 0.5]);
    expect(() => parseColor("oklch(0.5 0.1 20)")).toThrow(/unsupported/);
  });

  it("computes the WCAG ratio (black on white is 21:1)", () => {
    expect(contrastRatio(parseColor("#000000"), parseColor("#ffffff"))).toBeCloseTo(21, 5);
  });
});

describe("isSupportedColour", () => {
  it.each([
    "#003c96",
    "#ABCDEF",
    "rgb(0,0,0)",
    "rgb(255, 255, 255)",
    "RGB(1,2,3)",
    "rgba(1, 2, 3, 0.5)",
    "rgba(1,2,3,1)",
    "rgba(1,2,3,.25)",
    "rgba(1,2,3,0)",
  ])("accepts %s", (colour) => {
    expect(isSupportedColour(colour)).toBe(true);
  });

  it.each([
    "#abc",
    "#abcdefaa",
    " #ffffff",
    "#ffffff ",
    "rgb(256,0,0)",
    "rgb(1,2)",
    "rgb(1,2,3,0.5)",
    "rgba(1,2,3)",
    "rgba(0,0,0,1.5)",
    "rgba(0,0,0,-0.1)",
    "red",
    "oklch(0.5 0.1 20)",
    "",
  ])("rejects %j", (colour) => {
    expect(isSupportedColour(colour)).toBe(false);
  });

  it("accepts exactly what parseColor reads back unchanged", () => {
    expect(parseColor("rgba(1,2,3,.25)")).toEqual([1, 2, 3, 0.25]);
  });
});
