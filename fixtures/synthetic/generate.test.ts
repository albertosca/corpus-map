import { describe, expect, it } from "vitest";
import { type MapSpec, validateSpec } from "../../src/shared/spec";
import { generateCorpus, MIN_SIZE, TERRITORY_COUNT } from "./generate";

type Point = [number, number];

function cross(origin: Point, first: Point, second: Point): number {
  return (first[0] - origin[0]) * (second[1] - origin[1]) - (first[1] - origin[1]) * (second[0] - origin[0]);
}

/**
 * Andrew's monotone chain convex hull, inlined here as this test's own
 * geometry helper (the fix wave removed `src/territories/hull.ts`'s
 * `hullOf` as unused in production; this is its only remaining consumer,
 * checking that t2 sits inside t1's convex hull below).
 */
function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points.map((point) => [point[0], point[1]] as Point);
  const sorted = [...points].sort((first, second) => first[0] - second[0] || first[1] - second[1]);
  const deduped: Point[] = [];
  for (const point of sorted) {
    const last = deduped[deduped.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) deduped.push(point);
  }
  if (deduped.length < 3) return deduped;
  const build = (chainPoints: Point[]): Point[] => {
    const chain: Point[] = [];
    for (const point of chainPoints) {
      for (;;) {
        const first = chain[chain.length - 2];
        const second = chain[chain.length - 1];
        if (first === undefined || second === undefined || cross(first, second, point) > 0) break;
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...build(deduped), ...build([...deduped].reverse())];
}

function findTerritory(spec: MapSpec, id: string) {
  const territory = spec.territories.find((candidate) => candidate.id === id);
  if (!territory) throw new Error(`no territory ${id}`);
  return territory;
}

function memberPoints(spec: MapSpec, id: string): Point[] {
  const byId = new Map(spec.nodes.map((node) => [node.id, node]));
  return findTerritory(spec, id).members.map((memberId) => {
    const node = byId.get(memberId);
    if (!node) throw new Error(`dangling member ${memberId}`);
    return [node.x, node.y] as Point;
  });
}

function insidePolygon([horizontal, vertical]: Point, ring: Point[]): boolean {
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    if (!current || !previous) continue;
    if (
      current[1] > vertical !== previous[1] > vertical &&
      horizontal < ((previous[0] - current[0]) * (vertical - current[1])) / (previous[1] - current[1]) + current[0]
    )
      inside = !inside;
  }
  return inside;
}

function medianNearestNeighbour(points: Point[]): number {
  const nearestDistances = points.map((point, index) => {
    let best = Number.POSITIVE_INFINITY;
    points.forEach((other, otherIndex) => {
      if (index !== otherIndex) best = Math.min(best, Math.hypot(point[0] - other[0], point[1] - other[1]));
    });
    return best;
  });
  nearestDistances.sort((first, second) => first - second);
  const median = nearestDistances[Math.floor(nearestDistances.length / 2)];
  if (median === undefined) throw new Error("no points");
  return median;
}

/** The corpus shape spec 2 relies on: about 2% loose items and a heavy tail of territory sizes. */
function corpusShape(spec: MapSpec): { looseShare: number; largestOverMedian: number } {
  const loose = spec.nodes.filter((node) => node.territory === null).length;
  const sizes = spec.territories.map((territory) => territory.members.length).sort((first, second) => first - second);
  const median = sizes[Math.floor(sizes.length / 2)];
  const largest = sizes[sizes.length - 1];
  if (median === undefined || largest === undefined) throw new Error("no territories");
  return { looseShare: loose / spec.nodes.length, largestOverMedian: largest / median };
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
    expect(spec.nodes.some((node) => node.territory === null)).toBe(true);
  });

  it("rejects a size it cannot honour", () => {
    expect(() => generateCorpus({ seed: 1, size: MIN_SIZE - 1 })).toThrow(RangeError);
  });

  describe("planted hard cases, measured at 5000 items", () => {
    const spec = generateCorpus({ seed: 1, size: 5000 });

    it("t0 is U-shaped: its centroid is far from every member", () => {
      const points = memberPoints(spec, "t0");
      const [centreHorizontal, centreVertical] = findTerritory(spec, "t0").centroid;
      const nearest = Math.min(
        ...points.map(([horizontal, vertical]) => Math.hypot(horizontal - centreHorizontal, vertical - centreVertical)),
      );
      expect(nearest).toBeGreaterThan(5 * medianNearestNeighbour(points));
    });

    it("t1 is L-shaped around t2: t2 sits inside t1's convex hull, where t1 has no members", () => {
      expect(insidePolygon(findTerritory(spec, "t2").centroid, convexHull(memberPoints(spec, "t1")))).toBe(true);
      const cornerMembers = memberPoints(spec, "t1");
      const [innerHorizontal, innerVertical] = findTerritory(spec, "t2").centroid;
      const nearest = Math.min(
        ...cornerMembers.map(([horizontal, vertical]) =>
          Math.hypot(horizontal - innerHorizontal, vertical - innerVertical),
        ),
      );
      expect(nearest).toBeGreaterThan(5 * medianNearestNeighbour(cornerMembers));
    });

    it("t3 and t4 are adjacent and carry long names", () => {
      const first = findTerritory(spec, "t3");
      const second = findTerritory(spec, "t4");
      expect(Math.hypot(first.centroid[0] - second.centroid[0], first.centroid[1] - second.centroid[1])).toBeLessThan(
        30,
      );
      expect(first.name.length).toBeGreaterThanOrEqual(38);
      expect(second.name.length).toBeGreaterThanOrEqual(38);
    });

    it("t5 packs at least 300 items within radius 2.5 of its centroid", () => {
      // Drawn in a disk of radius 2; the centroid is the members' mean, which
      // sits slightly off the disk's centre, hence the half-unit margin.
      const points = memberPoints(spec, "t5");
      const [centreHorizontal, centreVertical] = findTerritory(spec, "t5").centroid;
      expect(points.length).toBeGreaterThanOrEqual(300);
      expect(
        points.every(
          ([horizontal, vertical]) => Math.hypot(horizontal - centreHorizontal, vertical - centreVertical) <= 2.5,
        ),
      ).toBe(true);
    });

    it("territory names span 3 to 40 characters", () => {
      const lengths = spec.territories.map((territory) => territory.name.length);
      expect(Math.min(...lengths)).toBeLessThanOrEqual(3);
      expect(Math.max(...lengths)).toBeGreaterThanOrEqual(40);
    });
  });
  describe("corpus shape", () => {
    for (const size of [MIN_SIZE, 5000]) {
      it(`keeps about 2% of ${size} items loose`, () => {
        const { looseShare } = corpusShape(generateCorpus({ seed: 1, size }));
        expect(looseShare).toBeGreaterThanOrEqual(0.015);
        expect(looseShare).toBeLessThanOrEqual(0.025);
      });
    }

    it("gives the largest territory at least 5 times the median's members at 5,000 items", () => {
      expect(corpusShape(generateCorpus({ seed: 1, size: 5000 })).largestOverMedian).toBeGreaterThanOrEqual(5);
    });

    it("tells a flat corpus with no loose items apart (the assertions' canary)", () => {
      const flat: MapSpec = {
        version: "1",
        territories: [0, 1, 2].map((index) => ({
          id: `t${index}`,
          name: `T${index}`,
          members: [`n${index}`],
          centroid: [index, 0],
        })),
        nodes: [0, 1, 2].map((index) => ({
          id: `n${index}`,
          label: `N${index}`,
          x: index,
          y: 0,
          territory: `t${index}`,
        })),
      };
      expect(corpusShape(flat)).toEqual({ looseShare: 0, largestOverMedian: 1 });
    });
  });
});
