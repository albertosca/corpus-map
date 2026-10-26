import { describe, expect, it } from "vitest";
import type { MapSpec } from "../shared/spec";
import { CARD_STRIPE_WIDTH } from "./CardOverlay";
import { type CardSizeOptions, cardSizeFor } from "./cardSizeFor";

function specWithLabels(labels: readonly string[]): MapSpec {
  return {
    version: "1",
    territories: [
      { id: "t", name: "Territory", members: labels.map((_label, index) => `n${index}`), centroid: [0, 0] },
    ],
    nodes: labels.map((label, index) => ({ id: `n${index}`, label, x: index, y: 0, territory: "t" })),
  };
}

/** Ten pixels per character, whatever the font: the arithmetic below reads straight off the label lengths. */
const tenPerCharacter: CardSizeOptions["measure"] = (text) => ({ width: text.length * 10 });

describe("cardSizeFor", () => {
  it("clamps a short percentile to the minimum width and takes one title line", () => {
    const labels = Array.from({ length: 10 }, (_unused, index) => "x".repeat(index + 1));
    // 90th percentile (nearest rank 9 of 10) is 90 px; column 45 → frame 66 → clamped to 120 (column 99) → 1 line.
    expect(cardSizeFor(specWithLabels(labels), { measure: tenPerCharacter })).toEqual({ width: 120, height: 38 });
  });

  it("splits a long title over the line budget", () => {
    // 400 px over two lines → column 200 → frame 200 + 16 padding + 5 border = 221;
    // height 2 × 16 × 1.25 + 16 padding + 2 border.
    expect(cardSizeFor(specWithLabels(["y".repeat(40)]), { measure: tenPerCharacter })).toEqual({
      width: 221,
      height: 58,
    });
  });

  it("clamps a very long title to the maximum width and still uses at most titleLines lines", () => {
    expect(cardSizeFor(specWithLabels(["z".repeat(60)]), { measure: tenPerCharacter })).toEqual({
      width: 240,
      height: 58,
    });
  });

  it("adds the extra lines to the height", () => {
    expect(cardSizeFor(specWithLabels(["y".repeat(40)]), { measure: tenPerCharacter, extraLines: 1 })).toEqual({
      width: 221,
      height: 78,
    });
  });

  it("takes the percentile, not the longest label", () => {
    const labels = [...Array.from({ length: 9 }, () => "a".repeat(10)), "b".repeat(200)];
    expect(cardSizeFor(specWithLabels(labels), { measure: tenPerCharacter }).width).toBe(120);
    expect(cardSizeFor(specWithLabels(labels), { measure: tenPerCharacter, percentile: 1 }).width).toBe(240);
  });

  it("gives the minimum width and one line for a spec with no nodes, or only empty labels", () => {
    expect(cardSizeFor(specWithLabels([]))).toEqual({ width: 120, height: 38 });
    expect(cardSizeFor(specWithLabels(["", ""]))).toEqual({ width: 120, height: 38 });
    // With no minimum to widen it, the frame is the padding and borders alone: still one line, never NaN.
    expect(cardSizeFor(specWithLabels(["", ""]), { minimumWidth: 1 })).toEqual({ width: 21, height: 38 });
  });

  it("measures with the library's estimate by default: 0.6 × the font's pixel size per character", () => {
    // 25 characters × 9.6 px = 240 px → column 120 → frame 141, two lines.
    expect(cardSizeFor(specWithLabels(["c".repeat(25)]))).toEqual({ width: 141, height: 58 });
    // The font's size drives the line height too: 20 px × 1.25 per line.
    expect(cardSizeFor(specWithLabels(["c".repeat(25)]), { font: "20px serif" }).height).toBe(68);
  });

  it("rounds both dimensions up to whole pixels", () => {
    const size = cardSizeFor(specWithLabels(["q".repeat(41)]), {
      measure: (text) => ({ width: text.length * 10.05 }),
      lineHeight: 1.3,
    });
    expect(size).toEqual({ width: Math.ceil((41 * 10.05) / 2 + 21), height: Math.ceil(2 * 16 * 1.3 + 18) });
  });

  it("includes CardOverlay's frame borders, so the renderer's own box is the padded text column", () => {
    // The frame is border-box: a 4 px stripe and a 1 px border across, 1 px top and bottom.
    const size = cardSizeFor(specWithLabels(["y".repeat(40)]), { measure: tenPerCharacter, padding: 0 });
    expect(size).toEqual({ width: 200 + CARD_STRIPE_WIDTH + 1, height: 2 * 16 * 1.25 + 2 });
  });

  it("takes the nearest rank without floating-point drift", () => {
    // 0.07 × 100 is 7.000000000000001 in floating point: rank 7 (70 px), not 8.
    const labels = Array.from({ length: 100 }, (_unused, index) => "x".repeat(index + 1));
    const size = cardSizeFor(specWithLabels(labels), { measure: tenPerCharacter, percentile: 0.07, minimumWidth: 1 });
    expect(size.width).toBe(35 + 21);
  });

  it("reads the font's px size as a CSS length: a leading-dot size, and any case of the unit", () => {
    const label = specWithLabels(["label"]);
    expect(cardSizeFor(label, { measure: tenPerCharacter, font: ".5px serif" }).height).toBe(
      Math.ceil(0.5 * 1.25 + 18),
    );
    expect(cardSizeFor(label, { measure: tenPerCharacter, font: "italic 16PX/2 serif" }).height).toBe(38);
  });

  it.each<[keyof CardSizeOptions, CardSizeOptions]>([
    ["font", { font: "large sans-serif" }],
    ["font", { font: "1e2px serif" }],
    ["lineHeight", { lineHeight: 0 }],
    ["lineHeight", { lineHeight: Number.NaN }],
    ["titleLines", { titleLines: 0 }],
    ["titleLines", { titleLines: 1.5 }],
    ["extraLines", { extraLines: -1 }],
    ["extraLines", { extraLines: 0.5 }],
    ["percentile", { percentile: 0 }],
    ["percentile", { percentile: 1.1 }],
    ["padding", { padding: -1 }],
    ["padding", { padding: Number.POSITIVE_INFINITY }],
    // 240 - 2 × 118 - 5 border leaves no text column at the widest frame.
    ["padding", { padding: 118 }],
    ["minimumWidth", { minimumWidth: 0 }],
    ["maximumWidth", { maximumWidth: 100 }],
    ["maximumWidth", { maximumWidth: Number.NaN }],
  ])("throws a RangeError naming %s when it is invalid", (option, options) => {
    expect(() => cardSizeFor(specWithLabels(["label"]), options)).toThrow(RangeError);
    expect(() => cardSizeFor(specWithLabels(["label"]), options)).toThrow(option);
  });

  it("throws a RangeError naming measure when it returns a width that is not finite", () => {
    const options: CardSizeOptions = { measure: () => ({ width: Number.NaN }) };
    expect(() => cardSizeFor(specWithLabels(["label"]), options)).toThrow(RangeError);
    expect(() => cardSizeFor(specWithLabels(["label"]), options)).toThrow("measure");
  });
});
