import { describe, expect, it } from "vitest";
import { generateCorpus } from "../../fixtures/synthetic/generate";
import type { MapSpec } from "../shared/spec";
import { chaikin, components, contains, disksOutline, extent, type Point, type Ring, ringArea, spacing } from "./shape";

function pointsOf(spec: MapSpec, id: string): Point[] {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  const t = spec.territories.find((x) => x.id === id);
  if (!t) throw new Error(`no territory ${id}`);
  return t.members.flatMap((m) => {
    const n = byId.get(m);
    return n ? [[n.x, n.y] as Point] : [];
  });
}

function outlineOf(spec: MapSpec, id: string) {
  const pts = pointsOf(spec, id);
  return disksOutline(pts, 2.5 * spacing(pts, 0.9));
}

function centroidOf(spec: MapSpec, id: string): Point {
  const t = spec.territories.find((x) => x.id === id);
  if (!t) throw new Error(`no territory ${id}`);
  return t.centroid;
}

describe("disksOutline on the synthetic corpus", () => {
  it.each([500, 5000])("draws every territory as a single region at %i items", (size) => {
    const spec = generateCorpus({ seed: 1, size });
    for (const t of spec.territories) {
      if (t.members.length < 3) continue;
      expect(outlineOf(spec, t.id)).toHaveLength(1);
    }
  });

  const spec = generateCorpus({ seed: 1, size: 5000 });

  it("keeps every member inside its own territory's outline", () => {
    for (const t of spec.territories) {
      const rings = outlineOf(spec, t.id);
      for (const p of pointsOf(spec, t.id)) expect(rings.some((r) => contains(r, p))).toBe(true);
    }
  });

  it("stays concave: the L (t1) does not cover t2, and the U (t0) does not cover its own centroid", () => {
    expect(outlineOf(spec, "t1").some((r) => contains(r, centroidOf(spec, "t2")))).toBe(false);
    expect(outlineOf(spec, "t0").some((r) => contains(r, centroidOf(spec, "t0")))).toBe(false);
  });

  it("is deterministic", () => {
    expect(outlineOf(spec, "t7")).toEqual(outlineOf(spec, "t7"));
  });
});

describe("shape helpers", () => {
  it("returns no ring for no points or a non-positive radius", () => {
    expect(disksOutline([], 1)).toEqual([]);
    expect(disksOutline([[0, 0]], 0)).toEqual([]);
  });

  it("draws a single point as a disk of about the requested radius", () => {
    const [ring] = disksOutline([[0, 0]], 1);
    if (!ring) throw new Error("no ring");
    expect(ringArea(ring)).toBeGreaterThan(Math.PI * 0.8);
    expect(ringArea(ring)).toBeLessThan(Math.PI * 1.2);
  });

  it("draws two far-apart points as two islands", () => {
    expect(
      disksOutline(
        [
          [0, 0],
          [100, 0],
        ],
        1,
      ),
    ).toHaveLength(2);
  });

  it("measures spacing as a quantile of nearest-neighbour distances", () => {
    const line: Point[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [10, 0],
    ];
    expect(spacing(line, 0)).toBe(1);
    expect(spacing(line, 1)).toBe(8);
    expect(spacing([[0, 0]], 0.9)).toBe(0);
  });

  it("chaikin doubles the vertex count and stays inside the original ring", () => {
    const square: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const cut = chaikin(square);
    expect(cut).toHaveLength(8);
    for (const p of cut)
      expect(
        contains(
          [
            [-0.01, -0.01],
            [10.01, -0.01],
            [10.01, 10.01],
            [-0.01, 10.01],
          ],
          p,
        ),
      ).toBe(true);
  });

  it("reports extent as the larger side of the bounding box", () => {
    expect(
      extent([
        [0, 0],
        [4, 1],
      ]),
    ).toBe(4);
    expect(extent([])).toBe(0);
  });

  it("cluster+outlier: a tight 20-point cluster plus one outlier 5,000 units away", () => {
    // Create a tight cluster of 20 points
    const cluster: Point[] = [];
    for (let i = 0; i < 20; i += 1) {
      cluster.push([i % 5, Math.floor(i / 5)] as Point);
    }
    // Add one outlier far away
    const points = [...cluster, [5000, 0] as Point];
    const rings = disksOutline(points, 2.5 * 5); // r = 12.5
    expect(rings).toHaveLength(2); // Should be 2 regions
    // Every cluster point should be inside some ring
    for (const p of cluster) {
      expect(rings.some((r) => contains(r, p))).toBe(true);
    }
    // The outlier should be inside some ring
    expect(rings.some((r) => contains(r, points[20] as Point))).toBe(true);
  });

  it("two points 2.83e9 apart with r = 1e6 give 2 rings", () => {
    const points: Point[] = [
      [0, 0],
      [2.83e9, 0],
    ];
    const rings = disksOutline(points, 1e6);
    expect(rings).toHaveLength(2);
  });

  it("chain of 10,000 points with r = 2.5 gives 1 ring with no non-finite vertices", () => {
    const points: Point[] = [];
    for (let i = 0; i < 10000; i += 1) {
      points.push([i, ((i % 7) * 0.1) as number] as Point);
    }
    const rings = disksOutline(points, 2.5);
    expect(rings).toHaveLength(1);
    // Check that no vertex is non-finite
    for (const ring of rings) {
      for (const [x, y] of ring) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
    // Check that approximately every 97th point is covered (rough check)
    const ring = rings[0] as Ring;
    let coveredCount = 0;
    for (let i = 0; i < points.length; i += 97) {
      if (contains(ring, points[i] as Point)) {
        coveredCount += 1;
      }
    }
    expect(coveredCount).toBeGreaterThan(0);
  });

  it("components groups points within the link distance and separates points beyond it", () => {
    // Case 1: Two separate clusters far apart
    const points1: Point[] = [
      [0, 0],
      [1, 0],
      [0, 1],
      [100, 100],
      [101, 100],
    ];
    const groups1 = components(points1, 5); // link = 5
    expect(groups1).toHaveLength(2);

    // Case 2: All points within link distance
    const points2: Point[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ];
    const groups2 = components(points2, 2); // link = 2
    expect(groups2).toHaveLength(1);

    // Case 3: Three separate groups
    const points3: Point[] = [
      [0, 0],
      [1, 0],
      [10, 0],
      [11, 0],
      [20, 0],
      [21, 0],
    ];
    const groups3 = components(points3, 2); // link = 2
    expect(groups3).toHaveLength(3);
  });
});
