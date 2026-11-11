import { describe, expect, it } from "vitest";
import { paintEdges } from "../edges/paintEdges";
import { estimateText } from "../labels/placement";
import { paintMatches } from "../points/paintMatches";
import { paintPoints } from "../points/paintPoints";
import { paintSelection } from "../points/paintSelection";
import { paintTerritories } from "../territories/paintTerritories";
import type { Ring } from "../territories/shape";
import { paint } from "./paint";
import { buildScene, type Scene } from "./scene";
import { validateSpec } from "./spec";
import { RecordingSurface } from "./surface";
import { DEFAULT_THEME } from "./theme";
import { DEFAULT_TUNING } from "./tuning";

const IDENTITY = { scale: 1, tx: 0, ty: 0 };
const triangle = (offset: number): Ring => [
  [offset, 0],
  [offset + 4, 0],
  [offset, 4],
];
const territoryScene = {
  paintOrder: ["a"],
  shapes: new Map([["a", [triangle(0)]]]),
  colours: new Map([["a", "#aa0000"]]),
  groupShapes: new Map([["family", [triangle(0)]]]),
  groupColours: new Map([["family", "#00cc00"]]),
  visitedShare: new Map(),
  groupVisitedShare: new Map(),
  groups: [{ id: "family", members: ["a"] }],
} as unknown as Scene;

const spec = validateSpec({
  version: "1",
  territories: [{ id: "t", name: "T", members: ["a", "b"], centroid: [10, 10] }],
  nodes: [
    { id: "a", label: "A", x: 10, y: 10, territory: "t", state: "unvisited" },
    { id: "b", label: "B", x: 20, y: 10, territory: "t" },
  ],
  edges: [{ source: "a", target: "b", weight: 1 }],
});
const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
const box = { width: 200, height: 200 };

describe("theme widths in the painters", () => {
  it("territory and family outlines read the theme, and default to the constants", () => {
    const custom = new RecordingSurface();
    paintTerritories(
      custom,
      territoryScene,
      IDENTITY,
      { ...DEFAULT_THEME, territoryOutlineWidth: 3, groupOutlineWidth: 4 },
      0.2,
      new Set(),
      0.5,
    );
    expect(custom.outlines.map((outline) => outline.width)).toEqual([3, 4]);
    const plain = new RecordingSurface();
    paintTerritories(plain, territoryScene, IDENTITY, DEFAULT_THEME, 0.2, new Set(), 0.5);
    expect(plain.outlines.map((outline) => outline.width)).toEqual([1, 1.75]);
  });

  it("the unvisited ring reads unvisitedRingWidth and keeps its outer edge at pointRadius", () => {
    const surface = new RecordingSurface();
    paintPoints(
      surface,
      scene,
      spec,
      { scale: 10, tx: 0, ty: 0 },
      { ...DEFAULT_THEME, unvisitedRingWidth: 1 },
      new Set(),
      1,
      box,
    );
    const unvisited = surface.hollowCircles.find((circle) => circle.id === "a");
    expect(unvisited?.width).toBe(1);
    expect((unvisited?.r ?? 0) + 0.5).toBe(DEFAULT_THEME.pointRadius);
  });

  it("a ring too wide to leave a hole draws a solid dot at pointRadius, never a zero-radius stroke that vanishes", () => {
    const surface = new RecordingSurface();
    paintPoints(
      surface,
      scene,
      spec,
      { scale: 10, tx: 0, ty: 0 },
      { ...DEFAULT_THEME, unvisitedRingWidth: 20 },
      new Set(),
      1,
      box,
    );
    expect(surface.hollowCircles.find((circle) => circle.id === "a")).toBeUndefined();
    const solid = surface.circles.find((circle) => circle.id === "a");
    expect(solid?.r).toBe(DEFAULT_THEME.pointRadius);
  });

  it("a ring exactly twice pointRadius wide is still a solid dot", () => {
    const surface = new RecordingSurface();
    paintPoints(
      surface,
      scene,
      spec,
      { scale: 10, tx: 0, ty: 0 },
      { ...DEFAULT_THEME, unvisitedRingWidth: DEFAULT_THEME.pointRadius * 2 },
      new Set(),
      1,
      box,
    );
    expect(surface.hollowCircles.find((circle) => circle.id === "a")).toBeUndefined();
    expect(surface.circles.find((circle) => circle.id === "a")?.r).toBe(DEFAULT_THEME.pointRadius);
  });

  it("the selection ring reads selectionRingWidth without moving the hit area", () => {
    const wide = new RecordingSurface();
    paintSelection(wide, scene, { scale: 10, tx: 0, ty: 0 }, { ...DEFAULT_THEME, selectionRingWidth: 4 }, "a");
    const base = new RecordingSurface();
    paintSelection(base, scene, { scale: 10, tx: 0, ty: 0 }, DEFAULT_THEME, "a");
    expect(wide.rings[0]?.width).toBe(4);
    expect(wide.rings[0]?.r).toBe((base.rings[0]?.r ?? 0) + 1);
    // the hit area is `Tuning.hoverRadius` and takes no theme, so a ring width cannot move it
  });

  it("the match ring reads matchRingWidth", () => {
    const surface = new RecordingSurface();
    paintMatches(
      surface,
      scene,
      { scale: 10, tx: 0, ty: 0 },
      { ...DEFAULT_THEME, matchRingWidth: 3 },
      new Set(["a"]),
      box,
    );
    expect(surface.hollowCircles[0]?.width).toBe(3);
  });

  it("the neighbour ring reads neighbourRingWidth", () => {
    const surface = new RecordingSurface();
    paintEdges(
      surface,
      scene,
      { scale: 10, tx: 0, ty: 0 },
      { ...DEFAULT_THEME, neighbourRingWidth: 3 },
      {
        id: "a",
        width: 200,
        height: 200,
        cap: 3,
        dimmed: new Set(),
        alpha: 1,
        restoreAlpha: 1,
      },
    );
    expect(surface.rings.map((ring) => ring.width)).toEqual([3]);
  });

  it("a theme with no width fields draws exactly the calls of one that states every default", () => {
    const explicit = {
      ...DEFAULT_THEME,
      territoryOutlineWidth: 1,
      groupOutlineWidth: 1.75,
      unvisitedRingWidth: 1.5,
      selectionRingWidth: 2,
      matchRingWidth: 1.5,
      neighbourRingWidth: 1.5,
    };
    const frame = {
      regime: "near" as const,
      pointAlpha: 1,
      width: 200,
      height: 200,
      selected: "a",
      hovered: "b",
      matches: new Set(["a"]),
    };
    const draw = (theme: typeof DEFAULT_THEME) => {
      const surface = new RecordingSurface();
      paint(surface, scene, spec, { scale: 10, tx: 0, ty: 0 }, frame, theme);
      return surface;
    };
    const unset = draw(DEFAULT_THEME);
    const stated = draw(explicit);
    expect(unset.calls).toEqual(stated.calls);
    expect(unset.rings).toEqual(stated.rings);
    expect(unset.hollowCircles).toEqual(stated.hollowCircles);
    expect(unset.outlines).toEqual(stated.outlines);
    expect(unset.rings.length + unset.hollowCircles.length).toBeGreaterThan(0);
  });
});
