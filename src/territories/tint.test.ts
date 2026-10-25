import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor } from "../labels/contrast";
import { lightness, TINT_CEILING, TINT_MARGIN, TINT_STEPS, tint, tintBand } from "./tint";

describe("tint", () => {
  it("returns the colour itself at step 0", () => {
    expect(tint("#003c96", 0, -1)).toBe("#003c96");
    expect(tint("rgb(0, 60, 150)", 0, 1)).toBe("#003c96");
  });

  it("darkens towards -1 and lightens towards +1, monotonically", () => {
    const againstWhite = (colour: string) => contrastRatio(parseColor(colour), parseColor("#ffffff"));
    const darker = TINT_STEPS.map((step) => againstWhite(tint("#7a45d6", step, -1)));
    const lighter = TINT_STEPS.map((step) => againstWhite(tint("#003c96", step, 1)));
    for (let index = 1; index < TINT_STEPS.length; index += 1) {
      expect(darker[index]).toBeGreaterThan(darker[index - 1] as number);
      expect(lighter[index]).toBeLessThan(lighter[index - 1] as number);
    }
  });

  it("scales every step into the side with room, so siblings stay distinct and inside the band", () => {
    const band = [0.6, TINT_CEILING] as const;
    for (const colour of ["#4fd1c5", "#96a5d2", "#0087e1"]) {
      const tints = TINT_STEPS.map((step) => tint(colour, step, 1, band));
      expect(new Set(tints).size).toBe(TINT_STEPS.length);
      for (const value of tints.slice(1).map(lightness)) {
        expect(value).toBeGreaterThanOrEqual(band[0] - 0.01);
        expect(value).toBeLessThanOrEqual(Math.max(band[1], lightness(colour)) + 0.01);
      }
    }
  });

  it("bands tints between the palette's extreme on the page's side and the limit on the label's side", () => {
    const palette = ["#0087e1", "#4fd1c5"];
    expect(tintBand(palette, 1)[0]).toBeCloseTo(lightness("#0087e1") + TINT_MARGIN, 6);
    expect(tintBand(palette, 1)[1]).toBe(TINT_CEILING);
    expect(tintBand(palette, -1)[1]).toBeCloseTo(lightness("#4fd1c5") - TINT_MARGIN, 6);
  });

  it("stays a valid #rrggbb colour at the extremes", () => {
    for (const colour of ["#000000", "#ffffff", "#ff0000", "#00ff00"])
      for (const step of TINT_STEPS)
        for (const direction of [1, -1] as const) expect(tint(colour, step, direction)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
