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

/** The rows-times-edges scan `visibleBorders` replaced: every edge tested against every row. */
function naiveOwners(shapes: ReadonlyMap<string, readonly Ring[]>, order: readonly string[], cells: number) {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  const drawn = (id: string) => (shapes.get(id) ?? []).filter((ring) => ring.length >= 3);
  for (const id of order)
    for (const ring of drawn(id))
      for (const [horizontal, vertical] of ring) {
        left = Math.min(left, horizontal);
        right = Math.max(right, horizontal);
        top = Math.min(top, vertical);
        bottom = Math.max(bottom, vertical);
      }
  const cell = Math.max(right - left, bottom - top) / cells;
  const columns = Math.ceil((right - left) / cell) + 1;
  const rows = Math.ceil((bottom - top) / cell) + 1;
  const owner = new Int32Array(columns * rows).fill(-1);
  for (const [index, id] of order.entries()) {
    for (let row = 0; row < rows; row += 1) {
      const vertical = top + (row + 0.5) * cell;
      const crossings: number[] = [];
      for (const ring of drawn(id))
        for (let edge = 0; edge < ring.length; edge += 1) {
          const current = ring[edge] as readonly [number, number];
          const previous = ring[(edge + ring.length - 1) % ring.length] as readonly [number, number];
          if (current[1] > vertical !== previous[1] > vertical)
            crossings.push(
              previous[0] + ((vertical - previous[1]) * (current[0] - previous[0])) / (current[1] - previous[1]),
            );
        }
      crossings.sort((first, second) => first - second);
      for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
        const firstColumn = Math.max(0, Math.ceil(((crossings[pair] as number) - left) / cell - 0.5));
        const lastColumn = Math.min(columns - 1, Math.floor(((crossings[pair + 1] as number) - left) / cell - 0.5));
        for (let column = firstColumn; column <= lastColumn; column += 1) owner[row * columns + column] = index;
      }
    }
  }
  return { owner, columns, rows };
}

describe("visibleBorders against the all-rows scan (spec mobile §7)", () => {
  it("finds the same visible cells and borders on seeded random rings", () => {
    let state = 7;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    for (let seed = 0; seed < 30; seed += 1) {
      const shapes = new Map<string, Ring[]>();
      for (let territory = 0; territory < 6; territory += 1) {
        const rings: Ring[] = [];
        for (let ringIndex = 0; ringIndex < 1 + (seed % 3); ringIndex += 1) {
          const centreHorizontal = random() * 100;
          const centreVertical = random() * 100;
          const ring: Ring = [];
          const corners = 3 + Math.floor(random() * 40);
          for (let corner = 0; corner < corners; corner += 1) {
            const angle = (corner / corners) * 2 * Math.PI;
            // Integer corners on even seeds put vertices exactly on row centres.
            const radius = 5 + random() * 30;
            const horizontal = centreHorizontal + radius * Math.cos(angle);
            const vertical = centreVertical + radius * Math.sin(angle);
            ring.push(seed % 2 === 0 ? [Math.round(horizontal), Math.round(vertical)] : [horizontal, vertical]);
          }
          rings.push(ring);
        }
        shapes.set(`t${territory}`, rings);
      }
      const order = largestFirst(shapes);
      const cells = 16 + seed;
      const expected = naiveOwners(shapes, order, cells);
      const visibleCells = new Map(order.map((id) => [id, 0]));
      const neighbours = new Map(order.map((id) => [id, new Map<string, number>()]));
      const { owner, columns, rows } = expected;
      const touch = (one: number, two: number) => {
        if (one < 0 || two < 0 || one === two) return;
        const first = neighbours.get(order[one] as string) as Map<string, number>;
        const second = neighbours.get(order[two] as string) as Map<string, number>;
        first.set(order[two] as string, (first.get(order[two] as string) ?? 0) + 1);
        second.set(order[one] as string, (second.get(order[one] as string) ?? 0) + 1);
      };
      for (let row = 0; row < rows; row += 1)
        for (let column = 0; column < columns; column += 1) {
          const here = owner[row * columns + column] as number;
          if (here >= 0) visibleCells.set(order[here] as string, (visibleCells.get(order[here] as string) ?? 0) + 1);
          if (column + 1 < columns) touch(here, owner[row * columns + column + 1] as number);
          if (row + 1 < rows) touch(here, owner[(row + 1) * columns + column] as number);
        }
      expect(visibleBorders(shapes, order, cells)).toEqual({ visibleCells, neighbours });
    }
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
