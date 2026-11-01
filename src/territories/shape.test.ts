import { describe, expect, it } from "vitest";
import { generateCorpus } from "../../fixtures/synthetic/generate";
import type { MapSpec } from "../shared/spec";
import { chaikin, components, contains, disksOutline, extent, type Point, type Ring, ringArea, spacing } from "./shape";

function pointsOf(spec: MapSpec, id: string): Point[] {
  const byId = new Map(spec.nodes.map((node) => [node.id, node]));
  const territory = spec.territories.find((candidate) => candidate.id === id);
  if (!territory) throw new Error(`no territory ${id}`);
  return territory.members.flatMap((member) => {
    const node = byId.get(member);
    return node ? [[node.x, node.y] as Point] : [];
  });
}

function outlineOf(spec: MapSpec, id: string) {
  const points = pointsOf(spec, id);
  return disksOutline(points, 2.5 * spacing(points, 0.9));
}

function centroidOf(spec: MapSpec, id: string): Point {
  const territory = spec.territories.find((candidate) => candidate.id === id);
  if (!territory) throw new Error(`no territory ${id}`);
  return territory.centroid;
}

describe("disksOutline on the synthetic corpus", () => {
  it.each([500, 5000])("draws every territory as a single region at %i items", (size) => {
    const spec = generateCorpus({ seed: 1, size });
    for (const territory of spec.territories) {
      if (territory.members.length < 3) continue;
      expect(outlineOf(spec, territory.id)).toHaveLength(1);
    }
  });

  const spec = generateCorpus({ seed: 1, size: 5000 });

  it("keeps every member inside its own territory's outline", () => {
    for (const territory of spec.territories) {
      const rings = outlineOf(spec, territory.id);
      for (const point of pointsOf(spec, territory.id)) expect(rings.some((ring) => contains(ring, point))).toBe(true);
    }
  });

  it("stays concave: the L (t1) does not cover t2, and the U (t0) does not cover its own centroid", () => {
    expect(outlineOf(spec, "t1").some((ring) => contains(ring, centroidOf(spec, "t2")))).toBe(false);
    expect(outlineOf(spec, "t0").some((ring) => contains(ring, centroidOf(spec, "t0")))).toBe(false);
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
    for (const point of cut)
      expect(
        contains(
          [
            [-0.01, -0.01],
            [10.01, -0.01],
            [10.01, 10.01],
            [-0.01, 10.01],
          ],
          point,
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
    for (let index = 0; index < 20; index += 1) {
      cluster.push([index % 5, Math.floor(index / 5)] as Point);
    }
    // Add one outlier far away
    const points = [...cluster, [5000, 0] as Point];
    const rings = disksOutline(points, 2.5 * 5); // r = 12.5
    expect(rings).toHaveLength(2); // Should be 2 regions
    // Every cluster point should be inside some ring
    for (const point of cluster) {
      expect(rings.some((ring) => contains(ring, point))).toBe(true);
    }
    // The outlier should be inside some ring
    expect(rings.some((ring) => contains(ring, points[20] as Point))).toBe(true);
    // With components, cluster ring area ~172-650; without components, dilation bloats it to ~2800
    const clusterPoint = cluster[0] as Point;
    const clusterRing = rings.find((ring) => contains(ring, clusterPoint));
    expect(clusterRing).toBeDefined();
    expect(ringArea(clusterRing as Ring)).toBeLessThan(800);
  });

  it("two points 2.83e9 apart with r = 1e6 give 2 rings", () => {
    const points: Point[] = [
      [0, 0],
      [2.83e9, 0],
    ];
    const rings = disksOutline(points, 1e6);
    expect(rings).toHaveLength(2);
    // Each point must be inside some ring
    for (const point of points) {
      expect(rings.some((ring) => contains(ring, point))).toBe(true);
    }
  });

  it("chain of 10,000 points with r = 2.5 gives 1 ring with no non-finite vertices", () => {
    const points: Point[] = [];
    for (let index = 0; index < 10000; index += 1) {
      points.push([index, ((index % 7) * 0.1) as number] as Point);
    }
    const rings = disksOutline(points, 2.5);
    expect(rings).toHaveLength(1);
    // Check that no vertex is non-finite
    for (const ring of rings) {
      for (const [horizontal, vertical] of ring) {
        expect(Number.isFinite(horizontal)).toBe(true);
        expect(Number.isFinite(vertical)).toBe(true);
      }
    }
    // Check that EVERY 97th point is covered
    const ring = rings[0] as Ring;
    for (let index = 0; index < points.length; index += 97) {
      expect(contains(ring, points[index] as Point)).toBe(true);
    }
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

  it("components finds the all-pairs groups, in the same order, on seeded random inputs (spec mobile §7)", () => {
    // The linear-congruential source placeBoxes.test.ts uses: same seed, same points, every run.
    let state = 0;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const allPairs = (points: readonly Point[], link: number): Point[][] => {
      const parent = points.map((_, index) => index);
      const find = (index: number): number => (parent[index] === index ? index : find(parent[index] as number));
      for (let first = 0; first < points.length; first += 1)
        for (let second = first + 1; second < points.length; second += 1) {
          const [firstPoint, secondPoint] = [points[first] as Point, points[second] as Point];
          if (Math.hypot(firstPoint[0] - secondPoint[0], firstPoint[1] - secondPoint[1]) <= link)
            parent[find(second)] = find(first);
        }
      const groups = new Map<number, Point[]>();
      for (const [index, point] of points.entries())
        groups.set(find(index), [...(groups.get(find(index)) ?? []), point]);
      return [...groups.values()];
    };
    for (let seed = 1; seed <= 40; seed += 1) {
      state = seed;
      const count = 2 + Math.floor(random() * 300);
      const spread = 1 + random() * 200;
      // Integer points half the time, so many pairs sit exactly `link` apart.
      const integers = seed % 2 === 0;
      const points: Point[] = Array.from({ length: count }, () => {
        const horizontal = random() * spread - spread / 3;
        const vertical = random() * spread - spread / 3;
        return integers ? [Math.round(horizontal), Math.round(vertical)] : [horizontal, vertical];
      });
      const link = integers ? 1 + Math.floor(random() * 5) : random() * 20;
      expect(components(points, link)).toEqual(allPairs(points, link));
    }
  });
});

// Inputs found by a search over random point sets (fewer than 1 in 1,000 reach a
// saddle): a grid cell whose two diagonal corners are inside and the other two
// out (codes 5 and 10). Two disks that overlap, however thinly, are one region;
// two that only touch at a point are two, because the field is strict (< 0).
describe("disksOutline at a marching-squares saddle", () => {
  it.each([
    {
      code: 5,
      neck: "(1.7, 1.4) and (3.1, 2.8), 1.98 apart",
      points: [
        [1.9, 3.8],
        [1.7, 1.4],
        [2.5, 0.3],
        [3.1, 2.8],
        [4.5, 3.7],
      ] as Point[],
    },
    {
      code: 10,
      neck: "(0.8, 3.8) and (2.3, 2.5), 1.985 apart",
      points: [
        [2.3, 2.5],
        [0.8, 3.8],
        [2.8, 1.9],
        [3.3, 2.3],
        [4.9, 2.9],
      ] as Point[],
    },
  ])("joins two disks that overlap through a thin diagonal neck into one ring (code $code: $neck)", ({ points }) => {
    const rings = disksOutline(points, 1);
    expect(rings).toHaveLength(1);
    for (const point of points) expect(contains(rings[0] as Ring, point)).toBe(true);
  });

  it.each([
    {
      code: 5,
      touch: "(1.3, 2.4) and (1.3, 0.4)",
      points: [
        [1, 3.7],
        [1.3, 2.4],
        [3, 2.2],
        [1.3, 0.4],
        [1.9, 4.4],
      ] as Point[],
    },
    {
      code: 10,
      touch: "(1.8, 3.6) and (3.8, 3.6)",
      points: [
        [3.6, 1.8],
        [1.8, 3.6],
        [3.8, 3.6],
      ] as Point[],
    },
  ])("keeps two disks that only touch at one point as two regions (code $code: $touch)", ({ points }) => {
    const rings = disksOutline(points, 1);
    expect(rings).toHaveLength(2);
    for (const point of points) expect(rings.some((ring) => contains(ring, point))).toBe(true);
  });
});
