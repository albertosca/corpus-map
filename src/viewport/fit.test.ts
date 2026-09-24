import { describe, expect, it } from "vitest";
import type { MapSpec } from "../shared/spec";
import { fitBounds, fitSpec, worldBounds } from "./fit";
import { toScreen } from "./viewport";

const spec = (pts: Array<[number, number]>): MapSpec => ({
  version: "1",
  territories: [],
  nodes: pts.map(([x, y], i) => ({ id: `n${i}`, label: `${i}`, x, y, territory: null })),
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
    const b = worldBounds(spec([[7, 7]]));
    expect(b.maxX).toBeGreaterThan(b.minX);
    expect(b.maxY).toBeGreaterThan(b.minY);
  });
});

describe("fitSpec", () => {
  it("places every node inside the viewport", () => {
    const s = spec([
      [-100, -100],
      [0, 0],
      [250, 80],
    ]);
    const v = fitSpec(s, 800, 600, 20);
    for (const n of s.nodes) {
      const [sx, sy] = toScreen(v, n.x, n.y);
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(800);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThanOrEqual(600);
    }
  });

  it("uses one scale for both axes so the map is not stretched", () => {
    const s = spec([
      [0, 0],
      [100, 1],
    ]);
    const v = fitSpec(s, 800, 600, 0);
    const [ax, ay] = toScreen(v, 0, 0);
    const [bx] = toScreen(v, 1, 0);
    const [, by] = toScreen(v, 0, 1);
    expect(Math.abs(bx - ax)).toBeCloseTo(Math.abs(by - ay), 6);
  });

  it("is built on the exported fitBounds, not a private copy of the same arithmetic (fix round 1, finding 3)", () => {
    // Not just numeric equivalence (two independent, coincidentally-equal
    // formulas would pass this too) — the shared-implementation revert-check
    // in this task's report breaks `fitBounds` itself and shows both this
    // assertion and `paintMinimap.test.ts`'s `minimapFit`-based ones fail
    // together, which a merely-equivalent duplicate could not.
    const s = spec([
      [-100, -100],
      [0, 0],
      [250, 80],
    ]);
    expect(fitBounds(worldBounds(s), 800, 600, 20)).toEqual(fitSpec(s, 800, 600, 20));
  });
});
