import { describe, expect, it } from "vitest";
import { type MapSpec, validateSpec } from "../../src/shared/spec";
import { hullOf } from "../../src/territories/hull";
import { generateCorpus, MIN_SIZE, TERRITORY_COUNT } from "./generate";

type Point = [number, number];

function territory(spec: MapSpec, id: string) {
  const t = spec.territories.find((x) => x.id === id);
  if (!t) throw new Error(`no territory ${id}`);
  return t;
}

function memberPoints(spec: MapSpec, id: string): Point[] {
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  return territory(spec, id).members.map((m) => {
    const n = byId.get(m);
    if (!n) throw new Error(`dangling member ${m}`);
    return [n.x, n.y] as Point;
  });
}

function insidePolygon([x, y]: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function medianNearestNeighbour(points: Point[]): number {
  const nn = points.map((p, i) => {
    let best = Number.POSITIVE_INFINITY;
    points.forEach((q, j) => {
      if (i !== j) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
    });
    return best;
  });
  nn.sort((a, b) => a - b);
  const mid = nn[Math.floor(nn.length / 2)];
  if (mid === undefined) throw new Error("no points");
  return mid;
}

describe("generateCorpus", () => {
  it("is deterministic for a seed and differs across seeds", () => {
    expect(generateCorpus({ seed: 7, size: 500 })).toEqual(generateCorpus({ seed: 7, size: 500 }));
    expect(generateCorpus({ seed: 7, size: 500 })).not.toEqual(generateCorpus({ seed: 8, size: 500 }));
  });

  it.each([100, 5000, 10000])("emits a valid corpus of exactly %i items", (size) => {
    const spec = generateCorpus({ seed: 1, size });
    expect(validateSpec(spec).nodes).toHaveLength(size);
    expect(spec.territories).toHaveLength(TERRITORY_COUNT);
    expect(spec.nodes.some((n) => n.territory === null)).toBe(true);
  });

  it("rejects a size it cannot honour", () => {
    expect(() => generateCorpus({ seed: 1, size: MIN_SIZE - 1 })).toThrow(RangeError);
  });

  describe("planted hard cases, measured at 5000 items", () => {
    const spec = generateCorpus({ seed: 1, size: 5000 });

    it("t0 is U-shaped: its centroid is far from every member", () => {
      const pts = memberPoints(spec, "t0");
      const [cx, cy] = territory(spec, "t0").centroid;
      const nearest = Math.min(...pts.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      expect(nearest).toBeGreaterThan(5 * medianNearestNeighbour(pts));
    });

    it("t1 is L-shaped around t2: t2's centroid lies inside t1's convex hull", () => {
      expect(insidePolygon(territory(spec, "t2").centroid, hullOf(memberPoints(spec, "t1")))).toBe(true);
    });

    it("t3 and t4 are adjacent and carry long names", () => {
      const a = territory(spec, "t3");
      const b = territory(spec, "t4");
      expect(Math.hypot(a.centroid[0] - b.centroid[0], a.centroid[1] - b.centroid[1])).toBeLessThan(30);
      expect(a.name.length).toBeGreaterThanOrEqual(38);
      expect(b.name.length).toBeGreaterThanOrEqual(38);
    });

    it("t5 packs at least 300 items within radius 2.5 of its centroid", () => {
      // Drawn in a disk of radius 2; the centroid is the members' mean, which
      // sits slightly off the disk's centre, hence the half-unit margin.
      const pts = memberPoints(spec, "t5");
      const [cx, cy] = territory(spec, "t5").centroid;
      expect(pts.length).toBeGreaterThanOrEqual(300);
      expect(pts.every(([x, y]) => Math.hypot(x - cx, y - cy) <= 2.5)).toBe(true);
    });

    it("territory names span 3 to 40 characters", () => {
      const lengths = spec.territories.map((t) => t.name.length);
      expect(Math.min(...lengths)).toBeLessThanOrEqual(3);
      expect(Math.max(...lengths)).toBeGreaterThanOrEqual(40);
    });
  });
});
