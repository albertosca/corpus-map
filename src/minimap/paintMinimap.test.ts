import { describe, expect, it } from "vitest";
import { estimateText } from "../labels/placement";
import { buildScene } from "../shared/scene";
import type { MapSpec } from "../shared/spec";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import { DEFAULT_TUNING } from "../shared/tuning";
import type { Bounds } from "../viewport/fit";
import { toScreen } from "../viewport/viewport";
import { minimapFit, paintMinimap } from "./paintMinimap";

const SIZE = { width: 160, height: 110 };

function sceneFor(spec: MapSpec) {
  return buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
}

describe("paintMinimap", () => {
  it("draws one polygon per ring plus a view rectangle, strictly inside size, positioned by the fitted transform", () => {
    // The boundary's own corners are exactly `world`'s corners, so the
    // padded fit (`minimapFit`) is the only thing keeping them off the
    // canvas edge: dropping the padding from that transform lands these
    // exactly on x=0/width or y=0/height, which the strict
    // toBeGreaterThan(0)/toBeLessThan(...) assertions below catch — this
    // file's revert-check.
    const world: Bounds = { minX: 0, minY: 0, maxX: 20, maxY: 10 };
    const spec: MapSpec = {
      version: "1",
      territories: [
        {
          id: "t1",
          name: "North",
          members: ["a"],
          centroid: [10, 5],
          boundary: [
            [0, 0],
            [20, 0],
            [20, 10],
            [0, 10],
          ],
        },
      ],
      nodes: [{ id: "a", label: "A", x: 10, y: 5, territory: "t1" }],
    };
    const scene = sceneFor(spec);
    const view = { x: 5, y: 2, w: 10, h: 5 };

    const s = new RecordingSurface();
    paintMinimap(s, scene, world, view, SIZE, DEFAULT_THEME);

    expect(s.polygons).toHaveLength(2); // 1 ring + 1 view rectangle
    const [ring, rect] = s.polygons;
    if (!ring || !rect) throw new Error("expected two polygons");

    for (const [x, y] of ring.points) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(SIZE.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(SIZE.height);
    }
    expect(ring.fill).toBe(DEFAULT_THEME.territoryFill);
    expect(ring.stroke).toBe(DEFAULT_THEME.territoryStroke);

    // The view rectangle matches the same fitted transform, corner for corner.
    const vp = minimapFit(world, SIZE);
    const expectedCorners = [
      toScreen(vp, view.x, view.y),
      toScreen(vp, view.x + view.w, view.y),
      toScreen(vp, view.x + view.w, view.y + view.h),
      toScreen(vp, view.x, view.y + view.h),
    ];
    expect(rect.points).toEqual(expectedCorners);
    expect(rect.stroke).toBe(DEFAULT_THEME.visited);
    for (const [x, y] of rect.points) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(SIZE.width);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(SIZE.height);
    }
  });

  it("draws one polygon per ring, summed across territories, not one per territory", () => {
    const world: Bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const spec: MapSpec = {
      version: "1",
      territories: [
        {
          id: "t1",
          name: "North",
          members: ["a"],
          centroid: [10, 10],
          boundary: [
            [0, 0],
            [20, 0],
            [20, 20],
            [0, 20],
          ],
        },
        {
          id: "t2",
          name: "South",
          members: ["b"],
          centroid: [80, 80],
          boundary: [
            [60, 60],
            [100, 60],
            [100, 100],
            [60, 100],
          ],
        },
      ],
      nodes: [
        { id: "a", label: "A", x: 10, y: 10, territory: "t1" },
        { id: "b", label: "B", x: 80, y: 80, territory: "t2" },
      ],
    };
    const scene = sceneFor(spec);
    const s = new RecordingSurface();
    paintMinimap(s, scene, world, { x: 0, y: 0, w: 100, h: 100 }, SIZE, DEFAULT_THEME);
    expect(s.polygons).toHaveLength(3); // 2 rings + 1 rectangle
  });

  it("clamps the view rectangle to size when the view extends beyond the world bounds", () => {
    const world: Bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "a", label: "A", x: 5, y: 5, territory: null }],
    };
    const scene = sceneFor(spec);
    // A view four times the world's extent, centred the same: its raw
    // (unclamped) transform lands well outside [0, SIZE.width/height] —
    // computed below to prove the assertion is not vacuous.
    const view = { x: -15, y: -15, w: 40, h: 40 };
    const vp = minimapFit(world, SIZE);
    const rawTopLeft = toScreen(vp, view.x, view.y);
    expect(rawTopLeft[0]).toBeLessThan(0);
    expect(rawTopLeft[1]).toBeLessThan(0);

    const s = new RecordingSurface();
    paintMinimap(s, scene, world, view, SIZE, DEFAULT_THEME);
    const rect = s.polygons[s.polygons.length - 1];
    if (!rect) throw new Error("expected a view rectangle");
    for (const [x, y] of rect.points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(SIZE.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(SIZE.height);
    }
    // Genuinely clamped, not coincidentally already inside: the top-left
    // corner is pinned to the canvas's own top-left edge.
    expect(rect.points[0]).toEqual([0, 0]);
  });
});
