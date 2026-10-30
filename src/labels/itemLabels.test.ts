import { describe, expect, it } from "vitest";
import type { MapSpec } from "../shared/spec";
import { DEFAULT_ITEM_LABEL_FONT, fontPixels, placeItemLabels, wrapLabel } from "./itemLabels";
import { estimateText, type PlacedLabel } from "./placement";

// estimateText at 10px: 6 px per character.
const FONT = "10px sans-serif";
const wrap = (text: string, width: number, lines = 3) => wrapLabel(text, FONT, width, lines, estimateText);

describe("wrapLabel", () => {
  it("keeps a short label on one line", () => expect(wrap("graph neural nets", 200)).toEqual(["graph neural nets"]));
  it("wraps at word boundaries into up to three lines", () =>
    expect(wrap("aaaa bbbb cccc dddd eeee ffff", 60)).toEqual(["aaaa bbbb", "cccc dddd", "eeee ffff"]));
  it("ends the last line in an ellipsis when text is left over", () => {
    const lines = wrap("aaaa bbbb cccc dddd eeee ffff gggg", 60);
    expect(lines).toHaveLength(3);
    expect(lines[2]?.endsWith("…")).toBe(true);
    expect(estimateText(lines[2] as string, FONT).width).toBeLessThanOrEqual(60);
  });
  it("cuts a single word wider than the width with an ellipsis", () => {
    const [line] = wrap("supercalifragilistic", 60);
    expect(line?.endsWith("…")).toBe(true);
    expect(estimateText(line as string, FONT).width).toBeLessThanOrEqual(60);
  });
  it("keeps the ellipsis alone when the width is narrower than it, the plate then wider than the width", () => {
    // The ellipsis is 6 px at 10px; a 3 px width cannot hold even that, and the loop still ends.
    expect(wrap("abc def", 3, 2)).toEqual(["…", "…"]);
  });
  it("gives no lines for an empty or blank label", () => {
    expect(wrap("", 60)).toEqual([]);
    expect(wrap("   ", 60)).toEqual([]);
  });
});

describe("fontPixels", () => {
  it("reads the px size, 12 without one", () => {
    expect(fontPixels(DEFAULT_ITEM_LABEL_FONT)).toBe(11);
    expect(fontPixels("bold serif")).toBe(12);
  });

  it("converts pt, em and rem sizes, so the line height follows the font the canvas draws (review M5)", () => {
    expect(fontPixels("500 15pt system-ui")).toBe(20);
    expect(fontPixels("italic 0.5em serif")).toBe(8);
    expect(fontPixels("1rem sans-serif")).toBe(16);
    expect(fontPixels("bold 11px/1.4 sans-serif")).toBe(11);
  });
});

const node = (id: string, horizontal: number, priority?: number) => ({
  id,
  label: `item ${id}`,
  x: horizontal,
  y: 0,
  territory: null,
  ...(priority === undefined ? {} : { priority }),
});
const OPTIONS = { font: "10px sans-serif", width: 160, lines: 3 };

describe("placeItemLabels", () => {
  it("orders by priority, then edge count, then id", () => {
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: [node("c", 0), node("b", 100), node("a", 200), node("p", 300, 5)],
      edges: [
        { source: "c", target: "b" },
        { source: "c", target: "a" },
      ],
    } as MapSpec;
    expect(placeItemLabels(spec, [], OPTIONS, estimateText).map((label) => label.id)).toEqual(["p", "c", "a", "b"]);
  });

  it("sizes the plate from the lines and puts its bottom 6 px above the point", () => {
    const spec = { version: "1", territories: [], nodes: [node("a", 0)] } as MapSpec;
    const [label] = placeItemLabels(spec, [], OPTIONS, estimateText);
    // "item a" = 6 chars × 6 px + 2 × 4 padding; one line of 12.5 px + 2 × 2.
    expect(label).toMatchObject({ lines: ["item a"], width: 44, height: 16.5, offset: [0, -(16.5 / 2 + 6)] });
  });

  it("never activates a label over a seeded territory name", () => {
    const spec = { version: "1", territories: [], nodes: [node("a", 0)] } as MapSpec;
    const seed: PlacedLabel = {
      id: "t",
      name: "Territory",
      anchor: [0, -1],
      labelClass: "large",
      width: 200,
      height: 40,
      activeFromScale: 0,
    };
    const [label] = placeItemLabels(spec, [seed], OPTIONS, estimateText);
    expect(label?.activeFromScale).toBeGreaterThan(0);
  });

  it("skips a node whose label is blank", () => {
    const spec = { version: "1", territories: [], nodes: [{ ...node("a", 0), label: " " }] } as MapSpec;
    expect(placeItemLabels(spec, [], OPTIONS, estimateText)).toEqual([]);
  });
});
