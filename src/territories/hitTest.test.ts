import { describe, expect, it } from "vitest";
import type { MapSpec } from "../shared/spec";
import type { Bounds } from "../viewport/fit";
import { onScreenTerritories, territoriesAt } from "./hitTest";
import type { Ring } from "./shape";

const square = (left: number, top: number, size: number): Ring => [
  [left, top],
  [left + size, top],
  [left + size, top + size],
  [left, top + size],
];
const box = (left: number, top: number, size: number): Bounds => ({
  minX: left,
  minY: top,
  maxX: left + size,
  maxY: top + size,
});

const spec: MapSpec = {
  version: "1",
  territories: [
    { id: "big", name: "Big", members: ["a", "b", "c"], centroid: [5, 5] },
    { id: "small", name: "Small", members: ["d"], centroid: [5, 5] },
    { id: "split", name: "Split", members: ["e", "f"], centroid: [50, 50] },
  ],
  nodes: [],
};
const scene = {
  shapes: new Map<string, Ring[]>([
    ["big", [square(0, 0, 10)]],
    ["small", [square(4, 4, 2)]],
    ["split", [square(40, 40, 2), square(60, 60, 2)]],
  ]),
  bounds: new Map<string, Bounds>([
    ["big", box(0, 0, 10)],
    ["small", box(4, 4, 2)],
    ["split", { minX: 40, minY: 40, maxX: 62, maxY: 62 }],
  ]),
};

describe("territoriesAt", () => {
  it("returns every territory holding the point, most members first", () => {
    expect(territoriesAt(scene, spec, [5, 5], new Set())).toEqual(["big", "small"]);
  });

  it("finds a territory through any of its disjoint rings, and not in the gap its box covers", () => {
    expect(territoriesAt(scene, spec, [61, 61], new Set())).toEqual(["split"]);
    expect(territoriesAt(scene, spec, [50, 50], new Set())).toEqual([]);
  });

  it("breaks a tie in member count by id", () => {
    const tied: MapSpec = {
      ...spec,
      territories: [...spec.territories, { id: "also", name: "Also", members: ["g"], centroid: [5, 5] }],
    };
    const withTie = {
      shapes: new Map([...scene.shapes, ["also", [square(4, 4, 2)]]]),
      bounds: new Map([...scene.bounds, ["also", box(4, 4, 2)]]),
    };
    expect(territoriesAt(withTie, tied, [5, 5], new Set())).toEqual(["big", "also", "small"]);
    expect(
      territoriesAt(withTie, { ...tied, territories: [...tied.territories].reverse() }, [5, 5], new Set()),
    ).toEqual(["big", "also", "small"]);
  });

  it("leaves out dimmed territories", () => {
    expect(territoriesAt(scene, spec, [5, 5], new Set(["big"]))).toEqual(["small"]);
  });

  it("returns nothing outside every box", () => {
    expect(territoriesAt(scene, spec, [-100, -100], new Set())).toEqual([]);
  });
});

describe("onScreenTerritories", () => {
  it("lists the territories whose box meets the view, sorted, edges included", () => {
    // Scale 10, no translation: the 100x100 view shows world [0, 10] x [0, 10].
    expect(onScreenTerritories(scene.bounds, { scale: 10, tx: 0, ty: 0 }, 100, 100)).toEqual(["big", "small"]);
    expect(onScreenTerritories(scene.bounds, { scale: 1, tx: 0, ty: 0 }, 100, 100)).toEqual(["big", "small", "split"]);
    expect(onScreenTerritories(scene.bounds, { scale: 10, tx: -1000, ty: -1000 }, 100, 100)).toEqual([]);
  });
});
