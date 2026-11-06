import { describe, expect, it } from "vitest";
import { DIMMED_ALPHA } from "../shared/dimmed";
import type { Scene } from "../shared/scene";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import { paintTerritories } from "./paintTerritories";
import type { Ring } from "./shape";
import { visitedFactor } from "./visitedFactor";

// Spec 2026-11-06-far-visited-design.md §2-3: each territory's fill is composited at the base alpha times its
// visited factor; shapes at the same alpha share one layer; no visited node paints what painted before.

const IDENTITY = { scale: 1, tx: 0, ty: 0 };
const BASE = 0.2;

const triangle = (offset: number): Ring => [
  [offset, 0],
  [offset + 4, 0],
  [offset, 4],
];

function leavesOf(visited: Record<string, number>): Scene {
  const ids = ["a", "b", "c"];
  return {
    paintOrder: ids,
    shapes: new Map(ids.map((id, index) => [id, [triangle(index * 10)]])),
    colours: new Map(ids.map((id) => [id, "#aa0000"])),
    groupShapes: new Map(),
    groupColours: new Map(),
    groups: [],
    visitedShare: new Map(Object.entries(visited)),
    groupVisitedShare: new Map(),
  } as unknown as Scene;
}

// Two leaves in one family, as the cross-fade tests build it.
function familyOf(visited: Record<string, number>): Scene {
  return {
    paintOrder: ["a", "b"],
    shapes: new Map([
      ["a", [triangle(0)]],
      ["b", [triangle(10)]],
    ]),
    colours: new Map([
      ["a", "#aa0000"],
      ["b", "#0000bb"],
    ]),
    groupShapes: new Map([["family", [triangle(0), triangle(10)]]]),
    groupColours: new Map([["family", "#00cc00"]]),
    groups: [{ id: "family", members: ["a", "b"] }],
    visitedShare: new Map(Object.entries(visited).filter(([id]) => id !== "family")),
    groupVisitedShare: new Map(Object.entries(visited).filter(([id]) => id === "family")),
  } as unknown as Scene;
}

const paintOf = (scene: Scene, dimmed: ReadonlySet<string> = new Set(), familyAlpha = 0, strength = 1) => {
  const surface = new RecordingSurface();
  paintTerritories(surface, scene, IDENTITY, DEFAULT_THEME, BASE, dimmed, familyAlpha, undefined, strength);
  return surface;
};

describe("paintTerritories fills by visited share", () => {
  it("with no visited node issues exactly the calls it issued before: one layer at the base alpha", () => {
    const surface = paintOf(leavesOf({}));
    expect(surface.layers).toEqual([BASE]);
    expect(surface.polygons).toHaveLength(3);
  });

  it("fills a fully visited territory at 1.5 times the base alpha, in the one layer the unvisited ones share", () => {
    const surface = paintOf(leavesOf({ b: 1 }));
    expect(surface.layers).toHaveLength(1);
    expect(surface.layers[0]).toBeCloseTo(BASE * 1.5, 12);
    // a and c sit at the base alpha, relative to the layer's: 1 / 1.5.
    expect(surface.alphas.filter((alpha) => Math.abs(alpha - 1 / 1.5) < 1e-12)).toHaveLength(2);
  });

  it("replaces what is under each shape when the steps differ, so an overlap shows the smallest at its own alpha", () => {
    // Each shape erases its own area, then draws: nothing blends across steps (review C1).
    const surface = paintOf(leavesOf({ a: 0.25, b: 0.5, c: 1 }));
    expect(surface.layers).toHaveLength(1);
    expect(surface.erased).toHaveLength(3);
    expect(surface.calls.filter((call) => call !== "alpha")).toEqual([
      "layer",
      "erase",
      "polygon",
      "erase",
      "polygon",
      "erase",
      "polygon",
      "layerEnd",
      "outline",
    ]);
    const ratios = surface.alphas.slice(0, 3).map((alpha) => alpha * BASE * 1.5);
    expect(ratios[0]).toBeCloseTo(BASE * visitedFactor(0.25), 12);
    expect(ratios[1]).toBeCloseTo(BASE * visitedFactor(0.5), 12);
  });

  it("erases nothing when every territory is at one step (the old calls)", () => {
    expect(paintOf(leavesOf({})).erased).toHaveLength(0);
    expect(paintOf(leavesOf({ a: 0.5, b: 0.55, c: 0.5 })).erased).toHaveLength(0);
  });

  it("never composites above 1, even for a theme fill that the boost would push past it", () => {
    const surface = new RecordingSurface();
    paintTerritories(surface, leavesOf({ a: 1, b: 1, c: 1 }), IDENTITY, DEFAULT_THEME, 0.9, new Set(), 0, undefined, 1);
    expect(surface.layers).toEqual([1]);
    const family = new RecordingSurface();
    paintTerritories(family, familyOf({ a: 1, b: 1, family: 1 }), IDENTITY, DEFAULT_THEME, 0.9, new Set(), 0.5);
    for (const alpha of family.layers) expect(Number.isFinite(alpha) && alpha <= 1).toBe(true);
  });

  it("keeps the dimmed fill at DIMMED_ALPHA inside a boosted layer", () => {
    const surface = paintOf(leavesOf({ a: 1 }), new Set(["a"]));
    expect(surface.alphas).toContain(DIMMED_ALPHA);
  });

  it("keeps a leaf and its family as opaque together as the boosted single fill (family weight 1 at rest)", () => {
    const surface = paintOf(familyOf({ a: 1, b: 1, family: 1 }));
    // familyAlpha 0: the family layer is drawn at level 0, the leaves at the boosted alpha.
    expect(surface.layers).toEqual([BASE * 1.5]);
    const half = paintOf(familyOf({ a: 1, b: 1, family: 1 }), new Set(), 0.5);
    const [leaf, family] = half.layers as [number, number];
    expect(1 - (1 - leaf) * (1 - family)).toBeCloseTo(BASE * 1.5, 12);
  });

  it("matches the unboosted cross-fade when no family node is visited (no lighter dip, no change)", () => {
    const boosted = paintOf(familyOf({}), new Set(), 0.5);
    const [leaf, family] = boosted.layers as [number, number];
    expect(1 - (1 - leaf) * (1 - family)).toBeCloseTo(BASE, 12);
  });

  it("reads a family's share from its own map, so a leaf whose id equals a family's does not boost the family", () => {
    const scene = { ...familyOf({}), visitedShare: new Map([["family", 1]]) } as unknown as Scene;
    const [leaf, family] = paintOf(scene, new Set(), 0.5).layers as [number, number];
    expect(1 - (1 - leaf) * (1 - family)).toBeCloseTo(BASE, 12);
  });

  it("scales the boost by its strength: none draws the base alpha, half draws the midway alpha", () => {
    expect(paintOf(leavesOf({ a: 1 }), new Set(), 0, 0).layers).toEqual([BASE]);
    const [half] = paintOf(leavesOf({ a: 1, b: 1, c: 1 }), new Set(), 0, 0.5).layers as [number];
    expect(half).toBeCloseTo(BASE * 1.25, 12);
  });
});
