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
    visitedShare: new Map(Object.entries(visited)),
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

  it("fills a fully visited territory at 1.75 times the base alpha, apart from an unvisited one", () => {
    const surface = paintOf(leavesOf({ b: 1 }));
    expect(surface.layers).toHaveLength(2);
    expect(surface.layers).toContain(BASE);
    expect(surface.layers.some((alpha) => Math.abs(alpha - BASE * 1.75) < 1e-12)).toBe(true);
  });

  it("puts territories at the same step in one layer, and uses at most one layer per distinct step", () => {
    const sameStep = paintOf(leavesOf({ a: 0.5, b: 0.55 }));
    expect(sameStep.layers).toHaveLength(2);
    const eachStep = paintOf(leavesOf({ a: 0.25, b: 0.5, c: 1 }));
    expect(eachStep.layers).toHaveLength(3);
    expect(eachStep.layers).toContain(BASE * visitedFactor(0.25));
  });

  it("keeps the dimmed fill at DIMMED_ALPHA inside a boosted layer", () => {
    const surface = paintOf(leavesOf({ a: 1 }), new Set(["a"]));
    expect(surface.alphas).toContain(DIMMED_ALPHA);
  });

  it("keeps a leaf and its family as opaque together as the boosted single fill (family weight 1 at rest)", () => {
    const surface = paintOf(familyOf({ a: 1, b: 1, family: 1 }));
    // familyAlpha 0: the family layer is drawn at level 0, the leaves at the boosted alpha.
    expect(surface.layers).toEqual([BASE * 1.75]);
    const half = paintOf(familyOf({ a: 1, b: 1, family: 1 }), new Set(), 0.5);
    const [leaf, family] = half.layers as [number, number];
    expect(1 - (1 - leaf) * (1 - family)).toBeCloseTo(BASE * 1.75, 12);
  });

  it("matches the unboosted cross-fade when no family node is visited (no lighter dip, no change)", () => {
    const boosted = paintOf(familyOf({}), new Set(), 0.5);
    const [leaf, family] = boosted.layers as [number, number];
    expect(1 - (1 - leaf) * (1 - family)).toBeCloseTo(BASE, 12);
  });

  it("scales the boost by its strength: none draws the base alpha, half draws the midway alpha", () => {
    expect(paintOf(leavesOf({ a: 1 }), new Set(), 0, 0).layers).toEqual([BASE]);
    const [half] = paintOf(leavesOf({ a: 1, b: 1, c: 1 }), new Set(), 0, 0.5).layers as [number];
    expect(half).toBeCloseTo(BASE * 1.375, 12);
  });
});
