import { describe, expect, it } from "vitest";
import { generateCorpus } from "../../fixtures/synthetic/generate";
import type { MapSpec } from "../shared/spec";
import { chaikin, contains, disksOutline, extent, type Point, ringArea, spacing } from "./shape";

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
});
