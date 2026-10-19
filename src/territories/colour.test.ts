import { describe, expect, it } from "vitest";
import type { Territory } from "../shared/spec";
import { assignTerritoryColours, largestFirst, visibleBorders } from "./colour";
import type { Ring } from "./shape";

const square = (left: number, top: number, size: number): Ring => [
  [left, top],
  [left + size, top],
  [left + size, top + size],
  [left, top + size],
];

const territory = (id: string, colour?: string): Territory => ({
  id,
  name: id,
  members: [],
  centroid: [0, 0],
  ...(colour === undefined ? {} : { colour }),
});

const PALETTE = ["red", "green", "blue"];

describe("largestFirst", () => {
  it("orders by total ring area, largest first, ties by id", () => {
    const shapes = new Map<string, Ring[]>([
      ["small", [square(0, 0, 1)]],
      ["large", [square(0, 0, 4)]],
      ["b-tie", [square(10, 0, 2)]],
      ["a-tie", [square(20, 0, 2)]],
    ]);
    expect(largestFirst(shapes)).toEqual(["large", "a-tie", "b-tie", "small"]);
  });

  it("counts a ring shorter than 3 points as no area", () => {
    const shapes = new Map<string, Ring[]>([
      [
        "line",
        [
          [
            [0, 0],
            [100, 100],
          ],
        ],
      ],
      ["dot", [square(0, 0, 1)]],
    ]);
    expect(largestFirst(shapes)).toEqual(["dot", "line"]);
  });
});

describe("visibleBorders", () => {
  it("finds a border between overlapping shapes and between a shape and the one nested inside it", () => {
    const shapes = new Map<string, Ring[]>([
      ["outer", [square(0, 0, 10)]],
      ["inner", [square(4, 4, 2)]],
      ["side", [square(9, 0, 5)]],
      ["far", [square(30, 30, 2)]],
    ]);
    const { neighbours, visibleCells } = visibleBorders(shapes, largestFirst(shapes), 64);
    expect(neighbours.get("outer")?.has("inner")).toBe(true);
    expect(neighbours.get("outer")?.has("side")).toBe(true);
    expect(neighbours.get("far")?.size).toBe(0);
    expect(visibleCells.get("inner")).toBeGreaterThan(0);
  });

  it("returns no cells and no neighbours for a degenerate extent", () => {
    const shapes = new Map<string, Ring[]>([
      ["empty", []],
      [
        "line",
        [
          [
            [0, 0],
            [0, 0],
            [0, 0],
          ],
        ],
      ],
    ]);
    const { neighbours, visibleCells } = visibleBorders(shapes, largestFirst(shapes));
    expect([...visibleCells.values()]).toEqual([0, 0]);
    expect([...neighbours.values()].every((map) => map.size === 0)).toBe(true);
  });
});

describe("assignTerritoryColours", () => {
  const overlapping = new Map<string, Ring[]>([
    ["one", [square(0, 0, 10)]],
    ["two", [square(5, 0, 10)]],
    ["three", [square(0, 5, 10)]],
  ]);
  const territories = ["one", "two", "three"].map((id) => territory(id));

  it("gives territories with a visible shared border different colours", () => {
    const colours = assignTerritoryColours(overlapping, territories, PALETTE);
    expect(new Set(colours.values()).size).toBe(3);
  });

  it("gives a nested territory a colour different from its container", () => {
    const nested = new Map<string, Ring[]>([
      ["outer", [square(0, 0, 10)]],
      ["inner", [square(4, 4, 2)]],
    ]);
    const colours = assignTerritoryColours(nested, [territory("outer"), territory("inner")], PALETTE);
    expect(colours.get("outer")).not.toBe(colours.get("inner"));
  });

  it("is deterministic", () => {
    expect([...assignTerritoryColours(overlapping, territories, PALETTE)]).toEqual([
      ...assignTerritoryColours(overlapping, territories, PALETTE),
    ]);
  });

  it("keeps a colour given by the data, and colours its neighbours around it", () => {
    const given = [territory("one", "green"), territory("two"), territory("three")];
    const colours = assignTerritoryColours(overlapping, given, PALETTE);
    expect(colours.get("one")).toBe("green");
    expect(colours.get("two")).not.toBe("green");
    expect(colours.get("three")).not.toBe("green");
  });

  it("keeps a given colour that is not in the palette without letting it block a palette colour", () => {
    const given = [territory("one", "#123456"), territory("two"), territory("three")];
    const colours = assignTerritoryColours(overlapping, given, PALETTE);
    expect(colours.get("one")).toBe("#123456");
    expect(colours.get("two")).toBe("red");
  });

  it("picks the colour shared with the least border when the palette is too small", () => {
    const colours = assignTerritoryColours(overlapping, territories, ["red", "green"]);
    expect(colours.size).toBe(3);
    expect(new Set(colours.values())).toEqual(new Set(["red", "green"]));
  });

  it("paints every territory the one colour of a one-colour palette", () => {
    const colours = assignTerritoryColours(overlapping, territories, ["red"]);
    expect([...colours.values()]).toEqual(["red", "red", "red"]);
  });

  it("returns only the given colours for an empty palette", () => {
    const given = [territory("one", "green"), territory("two"), territory("three")];
    expect([...assignTerritoryColours(overlapping, given, [])]).toEqual([["one", "green"]]);
  });

  it("colours a territory with no drawable ring without throwing", () => {
    const shapes = new Map<string, Ring[]>([["ghost", []], ...overlapping]);
    const colours = assignTerritoryColours(shapes, [territory("ghost"), ...territories], PALETTE);
    expect(colours.get("ghost")).toBe("red");
  });
});
