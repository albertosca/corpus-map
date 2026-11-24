import { describe, expect, it } from "vitest";
import { validateSpec } from "../shared/spec";
import type { Viewport } from "../viewport/viewport";
import { FOCUS_FEATHER, familyCounts, familyFocus, focusKeyOf, levelsOf, namesLeaf } from "./familyFocus";

const options = { focusFloor: 0.25, focusFull: 0.6 };
/** A corpus as large as the arXiv demo's: the shares are trusted from 96 on-screen items of the largest family. */
const LARGE_CORPUS = 8000;
const counts = (entries: Array<[string, number]>) => new Map(entries);

describe("familyFocus (spec family focus §2)", () => {
  it("gives the largest family 1 and a tie 1 each", () => {
    expect(
      familyFocus(
        counts([
          ["a", 10],
          ["b", 2],
        ]),
        options,
        LARGE_CORPUS,
      ).get("a"),
    ).toBe(1);
    const tied = familyFocus(
      counts([
        ["a", 7],
        ["b", 7],
      ]),
      options,
      LARGE_CORPUS,
    );
    expect([tied.get("a"), tied.get("b")]).toEqual([1, 1]);
  });

  it("gives a lone family 1", () => {
    expect(familyFocus(counts([["a", 3]]), options, LARGE_CORPUS).get("a")).toBe(1);
  });

  it("keeps every family at 1 when nothing is on screen", () => {
    const weights = familyFocus(
      counts([
        ["a", 0],
        ["b", 0],
      ]),
      options,
      LARGE_CORPUS,
    );
    expect([weights.get("a"), weights.get("b")]).toEqual([1, 1]);
  });

  it("gives a family with no items 0 beside a large maximum", () => {
    expect(
      familyFocus(
        counts([
          ["a", 100],
          ["b", 0],
        ]),
        options,
        LARGE_CORPUS,
      ).get("b"),
    ).toBe(0);
  });

  it("keeps a family mostly drawn while the largest has only a few items, and takes it down as they grow, one item at a time", () => {
    const weightOfEmpty = (largest: number) =>
      familyFocus(
        counts([
          ["a", largest],
          ["b", 0],
        ]),
        options,
        LARGE_CORPUS,
      ).get("b") as number;
    // An item entering an empty screen must not drop the other families from 1 to 0 in one step.
    expect(weightOfEmpty(1)).toBeGreaterThan(0.9);
    let largestStep = 0;
    for (let items = 1; items <= 120; items += 1)
      largestStep = Math.max(largestStep, Math.abs(weightOfEmpty(items) - weightOfEmpty(items - 1)));
    expect(largestStep).toBeLessThan(0.1);
    expect(weightOfEmpty(120)).toBe(0);
  });

  it("is 0 at or below the floor and 1 at or above the full share", () => {
    const weights = familyFocus(
      counts([
        ["a", 100],
        ["floor", 25],
        ["full", 60],
        ["above", 90],
      ]),
      options,
      LARGE_CORPUS,
    );
    expect([weights.get("floor"), weights.get("full"), weights.get("above")]).toEqual([0, 1, 1]);
  });

  it("is strictly between 0 and 1 between the floor and the full share, and monotonic", () => {
    const weights = familyFocus(
      counts([
        ["a", 100],
        ["low", 35],
        ["high", 50],
      ]),
      options,
      LARGE_CORPUS,
    );
    const low = weights.get("low") as number;
    const high = weights.get("high") as number;
    expect(low).toBeGreaterThan(0);
    expect(high).toBeLessThan(1);
    expect(high).toBeGreaterThan(low);
  });

  it("never returns NaN", () => {
    for (const total of [0, 1, 1e9]) {
      for (const weight of familyFocus(
        counts([
          ["a", total],
          ["b", total / 3],
        ]),
        options,
        LARGE_CORPUS,
      ).values()) {
        expect(Number.isNaN(weight)).toBe(false);
      }
    }
  });

  it("trusts the shares from fewer on-screen items on a small corpus (review I-1)", () => {
    const weightOfEmpty = (largest: number, corpusItems: number) =>
      familyFocus(
        counts([
          ["a", largest],
          ["b", 0],
        ]),
        options,
        corpusItems,
      ).get("b") as number;
    // The demo's Chemical elements corpus has 54 items: a screen holds a few dozen at most.
    expect(weightOfEmpty(24, 54)).toBe(0);
    expect(weightOfEmpty(24, LARGE_CORPUS)).toBeGreaterThan(0.5);
    expect(weightOfEmpty(96, LARGE_CORPUS)).toBe(0);
    // In between it scales with the corpus, so a corpus of a few thousand trusts the shares before 96.
    expect(weightOfEmpty(50, 4000)).toBe(0);
    expect(weightOfEmpty(50, LARGE_CORPUS)).toBeGreaterThan(0);
  });

  it("leaves an empty map empty", () => {
    expect(familyFocus(new Map(), options, LARGE_CORPUS).size).toBe(0);
  });
});

describe("levelsOf", () => {
  it("puts everything on the family at group alpha 1, whatever the weight", () => {
    expect(levelsOf(1, 0)).toEqual({ leaf: 0, family: 1 });
    expect(levelsOf(1, 1)).toEqual({ leaf: 0, family: 1 });
  });

  it("puts everything on the leaves at group alpha 0 and weight 1", () => {
    expect(levelsOf(0, 1)).toEqual({ leaf: 1, family: 0 });
  });

  it("puts everything on the family at group alpha 0 and weight 0", () => {
    expect(levelsOf(0, 0)).toEqual({ leaf: 0, family: 1 });
  });

  it("composes the cross-fade with the weight", () => {
    expect(levelsOf(0.5, 0.5)).toEqual({ leaf: 0.25, family: 0.75 });
  });
});

describe("namesLeaf (review I-3)", () => {
  it("is true while the leaf level is at least half, false below it", () => {
    expect(namesLeaf(0, 1)).toBe(true);
    expect(namesLeaf(0, 0.5)).toBe(true);
    expect(namesLeaf(0, 0.49)).toBe(false);
    expect(namesLeaf(0, 0)).toBe(false);
    expect(namesLeaf(0.6, 1)).toBe(false);
    expect(namesLeaf(0.4, 1)).toBe(true);
  });
});

describe("familyCounts (spec arxiv engine map §2)", () => {
  const WIDTH = 400;
  const HEIGHT = 300;
  const identity: Viewport = { scale: 1, tx: 0, ty: 0 };
  const families = ["alpha", "beta"];
  const familyOfLeaf = new Map([
    ["aleaf", "alpha"],
    ["bleaf", "beta"],
  ]);
  const specWith = (nodes: Array<{ id: string; x: number; y: number; territory: string | null }>) =>
    validateSpec({
      version: "1",
      territories: ["aleaf", "bleaf"].map((leaf) => ({
        id: leaf,
        name: leaf,
        members: nodes.filter((node) => node.territory === leaf).map((node) => node.id),
        centroid: [0, 0],
      })),
      nodes: nodes.map((node) => ({ ...node, label: node.id })),
    });

  it("counts an item in the middle of the box as 1 and one outside as nothing", () => {
    const spec = specWith([
      { id: "middle", x: 200, y: 150, territory: "aleaf" },
      { id: "outside", x: -50, y: 150, territory: "bleaf" },
    ]);
    const counts = familyCounts(spec.nodes, identity, WIDTH, HEIGHT, familyOfLeaf, families);
    expect(counts.get("alpha")).toBe(1);
    expect(counts.get("beta")).toBe(0);
  });

  it("moves a family's count continuously as an item crosses the box edge", () => {
    let previous = 0;
    let largestStep = 0;
    for (let step = -10; step <= 60; step += 1) {
      const spec = specWith([{ id: "crossing", x: (WIDTH * step) / 100, y: HEIGHT / 2, territory: "bleaf" }]);
      const count = familyCounts(spec.nodes, identity, WIDTH, HEIGHT, familyOfLeaf, families).get("beta") ?? 0;
      largestStep = Math.max(largestStep, Math.abs(count - previous));
      previous = count;
    }
    // One step is 1% of the box; the hard box jumped by a whole item on the edge.
    expect(largestStep).toBeLessThanOrEqual(0.2);
    expect(previous).toBe(1);
  });

  it("reaches 1 at FOCUS_FEATHER of the box inside", () => {
    const spec = specWith([{ id: "inside", x: WIDTH * FOCUS_FEATHER, y: HEIGHT / 2, territory: "aleaf" }]);
    expect(familyCounts(spec.nodes, identity, WIDTH, HEIGHT, familyOfLeaf, families).get("alpha")).toBe(1);
  });

  it("seeds every family at 0 and never returns NaN for an empty box", () => {
    // The item at the origin sits on screen 0 of a box of width 0: the 0/0 case.
    const spec = specWith([
      { id: "middle", x: 200, y: 150, territory: "aleaf" },
      { id: "origin", x: 0, y: 0, territory: "bleaf" },
    ]);
    const emptyBoxes: Array<[number, number]> = [
      [0, HEIGHT],
      [WIDTH, 0],
      [0, 0],
    ];
    for (const [width, height] of emptyBoxes)
      expect([...familyCounts(spec.nodes, identity, width, height, familyOfLeaf, families)]).toEqual([
        ["alpha", 0],
        ["beta", 0],
      ]);
  });

  it("skips an item with no territory and a leaf with no family", () => {
    const spec = specWith([
      { id: "loose", x: 200, y: 150, territory: null },
      { id: "orphan", x: 200, y: 150, territory: "bleaf" },
    ]);
    const counts = familyCounts(spec.nodes, identity, WIDTH, HEIGHT, new Map([["aleaf", "alpha"]]), families);
    expect([...counts]).toEqual([
      ["alpha", 0],
      ["beta", 0],
    ]);
  });

  it("leaves every family near 1 when all items sit in the feather band", () => {
    const nodes = Array.from({ length: 40 }, (_unused, position) => ({
      id: `edge${position}`,
      x: 2,
      y: 10 + position * 7,
      territory: position % 4 === 0 ? "bleaf" : "aleaf",
    }));
    const counts = familyCounts(specWith(nodes).nodes, identity, WIDTH, HEIGHT, familyOfLeaf, families);
    const weights = familyFocus(counts, { focusFloor: 0.5, focusFull: 1 }, LARGE_CORPUS);
    for (const weight of weights.values()) expect(weight).toBeGreaterThan(0.9);
  });
});

describe("focusKeyOf (spec arxiv engine map §3)", () => {
  it("gives the same key when no weight moves by a whole step of 1/256", () => {
    const before = new Map([
      ["family-a", 0.5],
      ["family-b", 1],
    ]);
    const after = new Map([
      ["family-a", 0.5 + 0.4 / 256],
      ["family-b", 1],
    ]);
    expect(focusKeyOf(after)).toBe(focusKeyOf(before));
  });

  it("changes the key when a weight moves by more than a step", () => {
    const before = new Map([["family-a", 0.5]]);
    const after = new Map([["family-a", 0.5 + 2 / 256]]);
    expect(focusKeyOf(after)).not.toBe(focusKeyOf(before));
  });

  it("round-trips through JSON as each family's weight, rounded to the step", () => {
    const weights = new Map([
      ["family-a", 0.3],
      ["family-b", 1],
      ["family-c", 0],
    ]);
    const parsed = new Map<string, number>(JSON.parse(focusKeyOf(weights)) as Array<[string, number]>);
    expect([...parsed.keys()]).toEqual(["family-a", "family-b", "family-c"]);
    expect(parsed.get("family-a")).toBe(Math.round(0.3 * 256) / 256);
    expect(parsed.get("family-b")).toBe(1);
    expect(parsed.get("family-c")).toBe(0);
  });
});
