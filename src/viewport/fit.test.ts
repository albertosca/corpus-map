import { describe, expect, it } from "vitest";
import type { MapSpec } from "../shared/spec";
import type { Ring } from "../territories/shape";
import { boundsOf, fitBounds, fitClamped, fitSpec, ringBounds, sceneBounds, worldBounds } from "./fit";
import { toScreen } from "./viewport";

const spec = (points: Array<[number, number]>): MapSpec => ({
  version: "1",
  territories: [],
  nodes: points.map(([horizontal, vertical], index) => ({
    id: `n${index}`,
    label: `${index}`,
    x: horizontal,
    y: vertical,
    territory: null,
  })),
});

describe("worldBounds", () => {
  it("spans the extremes", () => {
    expect(
      worldBounds(
        spec([
          [-3, 2],
          [5, -1],
        ]),
      ),
    ).toEqual({
      minX: -3,
      minY: -1,
      maxX: 5,
      maxY: 2,
    });
  });

  it("returns a unit box for an empty spec", () => {
    expect(worldBounds(spec([]))).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
  });

  it("returns a non-degenerate box for a single point", () => {
    const bounds = worldBounds(spec([[7, 7]]));
    expect(bounds.maxX).toBeGreaterThan(bounds.minX);
    expect(bounds.maxY).toBeGreaterThan(bounds.minY);
  });
});

describe("fitSpec", () => {
  it("places every node inside the viewport", () => {
    const mapSpec = spec([
      [-100, -100],
      [0, 0],
      [250, 80],
    ]);
    const fitted = fitSpec(mapSpec, 800, 600, 20);
    for (const node of mapSpec.nodes) {
      const [screenHorizontal, screenVertical] = toScreen(fitted, node.x, node.y);
      expect(screenHorizontal).toBeGreaterThanOrEqual(0);
      expect(screenHorizontal).toBeLessThanOrEqual(800);
      expect(screenVertical).toBeGreaterThanOrEqual(0);
      expect(screenVertical).toBeLessThanOrEqual(600);
    }
  });

  it("uses one scale for both axes so the map is not stretched", () => {
    const mapSpec = spec([
      [0, 0],
      [100, 1],
    ]);
    const fitted = fitSpec(mapSpec, 800, 600, 0);
    const [originHorizontal, originVertical] = toScreen(fitted, 0, 0);
    const [unitHorizontal] = toScreen(fitted, 1, 0);
    const [, unitVertical] = toScreen(fitted, 0, 1);
    expect(Math.abs(unitHorizontal - originHorizontal)).toBeCloseTo(Math.abs(unitVertical - originVertical), 6);
  });

  it("is built on the exported fitBounds, not a private copy of the same arithmetic (fix round 1, finding 3)", () => {
    // Not just numeric equivalence (two independent, coincidentally-equal
    // formulas would pass this too) — the shared-implementation revert-check
    // in this task's report breaks `fitBounds` itself and shows both this
    // assertion and `paintMinimap.test.ts`'s `minimapFit`-based ones fail
    // together, which a merely-equivalent duplicate could not.
    const mapSpec = spec([
      [-100, -100],
      [0, 0],
      [250, 80],
    ]);
    expect(fitBounds(worldBounds(mapSpec), 800, 600, 20)).toEqual(fitSpec(mapSpec, 800, 600, 20));
  });
});

describe("scene bounds", () => {
  const spec = {
    version: "1",
    territories: [],
    nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: null }],
  } as MapSpec;

  it("widens the node extent by every drawable ring, and ignores rings shorter than 3 points", () => {
    const shapes = new Map([
      [
        "t",
        [
          [
            [-5, -5],
            [5, -5],
            [5, 5],
          ] as Ring,
          [
            [-100, -100],
            [100, 100],
          ] as Ring,
        ],
      ],
    ]);
    expect(sceneBounds(spec, shapes)).toEqual({ minX: -5, minY: -5, maxX: 5, maxY: 5 });
  });

  it("keeps worldBounds' behaviour for nodes only, including the degenerate widening", () => {
    expect(sceneBounds(spec, new Map())).toEqual(worldBounds(spec));
    expect(boundsOf([])).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
  });

  it("returns null for a territory with no drawable ring", () => {
    expect(ringBounds([])).toBeNull();
    expect(
      ringBounds([
        [
          [0, 0],
          [1, 1],
        ] as Ring,
      ]),
    ).toBeNull();
    expect(
      ringBounds([
        [
          [0, 0],
          [2, 0],
          [2, 4],
        ] as Ring,
      ]),
    ).toEqual({ minX: 0, minY: 0, maxX: 2, maxY: 4 });
  });

  it("clamps a fit's scale and keeps the bounds centred", () => {
    const viewport = fitClamped({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 100, 100, 0, 1, 10);
    expect(viewport.scale).toBe(10);
    expect(viewport.tx + 0.5 * viewport.scale).toBe(50);
    expect(viewport.ty + 0.5 * viewport.scale).toBe(50);
  });
});

describe("fitClamped as the loose nodes' near view (spec slice B §5)", () => {
  it("keeps the box's own fit when that is already past the near scale", () => {
    const view = fitClamped({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 120, 120, 10, 2, 1000);
    expect(view.scale).toBeCloseTo(10, 9);
    expect(view.tx).toBeCloseTo(60 - 5 * 10, 9);
  });

  it("zooms to the near scale when the box's fit is wider than near", () => {
    const view = fitClamped({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 }, 120, 120, 10, 5, 1000);
    expect(view.scale).toBe(5);
    expect(view.tx).toBeCloseTo(60 - 500 * 5, 9);
    expect(view.ty).toBeCloseTo(60 - 500 * 5, 9);
  });

  it("never passes the maximum scale", () => {
    expect(fitClamped({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 120, 120, 10, 5, 50).scale).toBe(50);
  });

  it("centres a single point with a finite scale", () => {
    const view = fitClamped(boundsOf([[7, 3]]), 200, 100, 10, 5, 64);
    expect(Number.isFinite(view.scale)).toBe(true);
    expect(view.tx + 7 * view.scale).toBeCloseTo(100, 9);
    expect(view.ty + 3 * view.scale).toBeCloseTo(50, 9);
  });
});
