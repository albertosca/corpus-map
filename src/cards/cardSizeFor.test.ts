import { describe, expect, it } from "vitest";
import type { MapSpec } from "../shared/spec";
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
    // 90th percentile (nearest rank 9 of 10) is 90 px; column 45 → frame 61 → clamped to 120 (column 104) → 1 line.
    expect(cardSizeFor(specWithLabels(labels), { measure: tenPerCharacter })).toEqual({ width: 120, height: 36 });
  });

  it("splits a long title over the line budget", () => {
    // 400 px over two lines → column 200 → frame 216; height 2 × 16 × 1.25 + 16.
    expect(cardSizeFor(specWithLabels(["y".repeat(40)]), { measure: tenPerCharacter })).toEqual({
      width: 216,
      height: 56,
    });
  });

  it("clamps a very long title to the maximum width and still uses at most titleLines lines", () => {
    expect(cardSizeFor(specWithLabels(["z".repeat(60)]), { measure: tenPerCharacter })).toEqual({
      width: 240,
      height: 56,
    });
  });

  it("adds the extra lines to the height", () => {
    expect(cardSizeFor(specWithLabels(["y".repeat(40)]), { measure: tenPerCharacter, extraLines: 1 })).toEqual({
      width: 216,
      height: 76,
    });
  });

  it("takes the percentile, not the longest label", () => {
    const labels = [...Array.from({ length: 9 }, () => "a".repeat(10)), "b".repeat(200)];
    expect(cardSizeFor(specWithLabels(labels), { measure: tenPerCharacter }).width).toBe(120);
    expect(cardSizeFor(specWithLabels(labels), { measure: tenPerCharacter, percentile: 1 }).width).toBe(240);
  });

  it("gives the minimum width and one line for a spec with no nodes, or only empty labels", () => {
    expect(cardSizeFor(specWithLabels([]))).toEqual({ width: 120, height: 36 });
    expect(cardSizeFor(specWithLabels(["", ""]))).toEqual({ width: 120, height: 36 });
  });

  it("measures with the library's estimate by default: 0.6 × the font's pixel size per character", () => {
    // 25 characters × 9.6 px = 240 px → column 120 → frame 136, two lines.
    expect(cardSizeFor(specWithLabels(["c".repeat(25)]))).toEqual({ width: 136, height: 56 });
    // The font's size drives the line height too: 20 px × 1.25 per line.
    expect(cardSizeFor(specWithLabels(["c".repeat(25)]), { font: "20px serif" }).height).toBe(66);
  });

  it("rounds both dimensions up to whole pixels", () => {
    const size = cardSizeFor(specWithLabels(["q".repeat(41)]), {
      measure: (text) => ({ width: text.length * 10.05 }),
      lineHeight: 1.3,
    });
    expect(size).toEqual({ width: Math.ceil((41 * 10.05) / 2 + 16), height: Math.ceil(2 * 16 * 1.3 + 16) });
  });

  it("gives the title its whole line budget when the padding leaves no text column", () => {
    // Frame clamped to 240 with 150 px of padding a side: no column to measure lines against.
    expect(cardSizeFor(specWithLabels(["label"]), { padding: 150 })).toEqual({ width: 240, height: 340 });
  });

  it.each<[keyof CardSizeOptions, CardSizeOptions]>([
    ["font", { font: "large sans-serif" }],
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
