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

  it("clamps a partially-overflowing view (one side over the edge, the other not) to a proper rectangle, not a skewed quadrilateral (fix round 1, finding 4)", () => {
    // CorpusMap.tsx's own MAX_ZOOM_OUT is 8, so a view up to 8x the fitted
    // extent on every side is reachable at the wheel/handle clamp; a view
    // shifted off-centre at that scale overflows on some sides and not
    // others — the case per-corner clamping (the pre-fix implementation)
    // could in principle skew into a non-rectangular quadrilateral, unlike
    // the fully-symmetric 4x-centred overflow the test above already
    // covers.
    const world: Bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "a", label: "A", x: 5, y: 5, territory: null }],
    };
    const scene = sceneFor(spec);
    // World is 10x10 centred at (5,5). This view is 8x that extent (80x80)
    // but shifted so its right/bottom edge sits near the world's own
    // right/bottom edge instead of centred — overflowing hard to the left
    // and top, landing close to (or inside) the canvas on the right/bottom.
    const view = { x: -70, y: -70, w: 80, h: 80 };
    const vp = minimapFit(world, SIZE);
    const [rawLeft, rawTop] = toScreen(vp, view.x, view.y);
    const [rawRight, rawBottom] = toScreen(vp, view.x + view.w, view.y + view.h);
    // Confirms this is a genuinely partial, asymmetric overflow: left/top
    // are off-canvas, right/bottom are not (so clamping only touches two of
    // the four sides, not all four the way the symmetric test above does).
    expect(rawLeft).toBeLessThan(0);
    expect(rawTop).toBeLessThan(0);
    expect(rawRight).toBeGreaterThan(0);
    expect(rawRight).toBeLessThan(SIZE.width);
    expect(rawBottom).toBeGreaterThan(0);
    expect(rawBottom).toBeLessThan(SIZE.height);

    const s = new RecordingSurface();
    paintMinimap(s, scene, world, view, SIZE, DEFAULT_THEME);
    const rect = s.polygons[s.polygons.length - 1];
    if (!rect) throw new Error("expected a view rectangle");
    const [p0, p1, p2, p3] = rect.points;
    if (!p0 || !p1 || !p2 || !p3) throw new Error("expected four corners");
    // A proper axis-aligned rectangle in the same winding order paintMinimap
    // always uses (top-left, top-right, bottom-right, bottom-left): the two
    // "left" corners share an x, the two "right" corners share the other x,
    // the two "top" corners share a y, the two "bottom" corners share the
    // other — never four independently-placed points.
    expect(p0[0]).toBe(p3[0]); // left edge: same x top and bottom
    expect(p1[0]).toBe(p2[0]); // right edge: same x top and bottom
    expect(p0[1]).toBe(p1[1]); // top edge: same y left and right
    expect(p2[1]).toBe(p3[1]); // bottom edge: same y left and right
    expect(p0[0]).toBe(0); // clamped hard left
    expect(p0[1]).toBe(0); // clamped hard top
    expect(p1[0]).toBeCloseTo(rawRight, 6); // right edge unclamped
    expect(p2[1]).toBeCloseTo(rawBottom, 6); // bottom edge unclamped
  });

  it("clears before drawing on every paint, so a second paint (view moved) leaves only its own rectangle", () => {
    // No territories: each paint draws exactly one polygon (the view
    // rectangle), so "leaves only the second rectangle" reduces to "exactly
    // one polygon call since the last clear" — checked through the
    // recording below, not by inspecting a rendered image (fix round 1,
    // finding 1: a real canvas erases everything drawn before `clear()`, so
    // only calls issued after the *last* clear are actually visible).
    const world: Bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "a", label: "A", x: 5, y: 5, territory: null }],
    };
    const scene = sceneFor(spec);
    const s = new RecordingSurface();

    const view1 = { x: 1, y: 1, w: 2, h: 2 };
    paintMinimap(s, scene, world, view1, SIZE, DEFAULT_THEME);
    expect(s.calls[0]).toBe("clear");
    expect(s.cleared).toBe(1);

    const view2 = { x: 5, y: 5, w: 2, h: 2 };
    paintMinimap(s, scene, world, view2, SIZE, DEFAULT_THEME);
    expect(s.cleared).toBe(2);

    // Locate the second paint's own "clear" (not the first paint's).
    const secondClearIndex = s.calls.indexOf("clear", s.calls.indexOf("clear") + 1);
    expect(secondClearIndex).toBeGreaterThan(0);

    const callsSinceLastClear = s.calls.slice(secondClearIndex);
    expect(callsSinceLastClear.filter((c) => c === "polygon")).toHaveLength(1);

    const vp = minimapFit(world, SIZE);
    const expectedSecondRect = [
      toScreen(vp, view2.x, view2.y),
      toScreen(vp, view2.x + view2.w, view2.y),
      toScreen(vp, view2.x + view2.w, view2.y + view2.h),
      toScreen(vp, view2.x, view2.y + view2.h),
    ];
    const lastPolygon = s.polygons[s.polygons.length - 1];
    if (!lastPolygon) throw new Error("expected a polygon");
    expect(lastPolygon.points).toEqual(expectedSecondRect);
  });
});
