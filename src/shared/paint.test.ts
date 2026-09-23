import { describe, expect, it } from "vitest";
import { generateCorpus } from "../../fixtures/synthetic/generate";
import { estimateText } from "../labels/placement";
import { DEFAULT_THRESHOLDS, type Regime } from "../lod/lod";
import { fitSpec, worldBounds } from "../viewport/fit";
import { type Frame, paint } from "./paint";
import { buildScene } from "./scene";
import type { MapSpec } from "./spec";
import { RecordingSurface } from "./surface";
import { DEFAULT_THEME } from "./theme";
import { DEFAULT_TUNING } from "./tuning";

const spec: MapSpec = {
  version: "1",
  territories: [{ id: "t1", name: "North", members: ["a", "b", "c"], centroid: [1, 1] }],
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, territory: "t1", state: "visited" },
    { id: "b", label: "B", x: 2, y: 0, territory: "t1", state: "unvisited" },
    { id: "c", label: "C", x: 1, y: 2, territory: "t1" },
    { id: "loose", label: "Loose", x: 9, y: 9, territory: null },
  ],
};

const vp = { scale: 10, tx: 0, ty: 0 };

function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("expected at least one item");
  return item;
}

function frameFor(regime: Regime, extra?: Partial<Frame>): Frame {
  return { regime, ratio: 1, pointAlpha: 1, ...extra };
}

function paintSpec(s: MapSpec, surface: RecordingSurface, regime: Regime, extra?: Partial<Frame>): void {
  const scene = buildScene(s, DEFAULT_TUNING, DEFAULT_THEME, estimateText, 1);
  paint(surface, scene, s, vp, frameFor(regime, extra), DEFAULT_THEME);
}

describe("paint", () => {
  it("draws territory boundary and name at the far regime, and no points", () => {
    const s = new RecordingSurface();
    paintSpec(spec, s, "far");
    expect(s.polygons.length).toBeGreaterThanOrEqual(1);
    expect(s.texts.map((t) => t.text)).toContain("North");
    expect(s.circles).toHaveLength(0);
  });

  it("draws boundaries and every point at the mid regime", () => {
    const s = new RecordingSurface();
    paintSpec(spec, s, "mid");
    expect(s.polygons.length).toBeGreaterThanOrEqual(1);
    expect(s.circles).toHaveLength(4);
  });

  it("draws an un-territoried node without stretching any boundary toward it", () => {
    const s = new RecordingSurface();
    paintSpec(spec, s, "mid");
    const ring = first(s.polygons).points;
    expect(ring.every(([x]) => x < 90)).toBe(true);
  });

  it("renders a spec where every node is un-territoried", () => {
    const only = { version: "1", territories: [], nodes: [spec.nodes[3]] } as MapSpec;
    const s = new RecordingSurface();
    paintSpec(only, s, "mid");
    expect(s.polygons).toHaveLength(0);
    expect(s.circles).toHaveLength(1);
  });

  it("distinguishes visited from unvisited by fill", () => {
    const s = new RecordingSurface();
    paintSpec(spec, s, "mid");
    const a = s.circles.find((c) => c.id === "a");
    const b = s.circles.find((c) => c.id === "b");
    expect(a?.fill).not.toBe(b?.fill);
  });

  it("treats a node with no state as unvisited", () => {
    const s = new RecordingSurface();
    paintSpec(spec, s, "mid");
    const b = s.circles.find((c) => c.id === "b");
    const c = s.circles.find((c) => c.id === "c");
    expect(c?.fill).toBe(b?.fill);
  });

  it("places points through the viewport transform", () => {
    const s = new RecordingSurface();
    paintSpec(spec, s, "mid");
    expect(s.circles.find((c) => c.id === "b")).toMatchObject({ x: 20, y: 0 });
  });

  it("clears before drawing", () => {
    const s = new RecordingSurface();
    paintSpec(spec, s, "far");
    expect(s.cleared).toBe(1);
  });

  it("uses an explicit territory boundary instead of hull", () => {
    const specWithBoundary: MapSpec = {
      version: "1",
      territories: [
        {
          id: "t2",
          name: "Custom",
          members: ["x", "y", "z"],
          centroid: [1, 1],
          boundary: [
            [0, 0],
            [3, 0],
            [0, 3],
          ],
        },
      ],
      nodes: [
        { id: "x", label: "X", x: 0, y: 0, territory: "t2" },
        { id: "y", label: "Y", x: 2, y: 0, territory: "t2" },
        { id: "z", label: "Z", x: 1, y: 2, territory: "t2" },
      ],
    };
    const s = new RecordingSurface();
    paintSpec(specWithBoundary, s, "mid");
    const ring = first(s.polygons).points;
    expect(ring).toEqual([
      [0, 0],
      [30, 0],
      [0, 30],
    ]);
  });

  it("paints points at the frame's pointAlpha, and the alpha is reset to 1 afterwards", () => {
    const s = new RecordingSurface();
    paintSpec(spec, s, "mid", { pointAlpha: 0.4 });
    expect(s.alphas[0]).toBe(0.4);
    expect(s.alphas[s.alphas.length - 1]).toBe(1);
    expect(s.circles).toHaveLength(4);
  });

  it("paints no points when pointAlpha is 0", () => {
    const s = new RecordingSurface();
    paintSpec(spec, s, "mid", { pointAlpha: 0 });
    expect(s.circles).toHaveLength(0);
    expect(s.alphas).toHaveLength(0);
  });

  it("does not draw a name whose activeFrom exceeds the current ratio", () => {
    const two: MapSpec = {
      version: "1",
      territories: [
        { id: "big", name: "Big Territory", members: ["a", "b", "c", "d", "e"], centroid: [0, 0] },
        { id: "small", name: "Small Territory", members: ["f", "g"], centroid: [0.2, 0] },
      ],
      nodes: [
        { id: "a", label: "A", x: -1, y: -1, territory: "big" },
        { id: "b", label: "B", x: 1, y: -1, territory: "big" },
        { id: "c", label: "C", x: 1, y: 1, territory: "big" },
        { id: "d", label: "D", x: -1, y: 1, territory: "big" },
        { id: "e", label: "E", x: 0, y: 0, territory: "big" },
        { id: "f", label: "F", x: 0.15, y: 0, territory: "small" },
        { id: "g", label: "G", x: 0.25, y: 0, territory: "small" },
      ],
    };
    const scene = buildScene(two, DEFAULT_TUNING, DEFAULT_THEME, estimateText, 1);
    const small = scene.labels.find((l) => l.id === "small");
    if (!small) throw new Error("expected a placed label for 'small'");
    expect(small.activeFrom).toBeGreaterThan(0);

    const below = new RecordingSurface();
    paint(below, scene, two, vp, { regime: "mid", ratio: small.activeFrom / 2, pointAlpha: 1 }, DEFAULT_THEME);
    expect(below.texts.map((t) => t.text)).not.toContain("Small Territory");

    const above = new RecordingSurface();
    paint(above, scene, two, vp, { regime: "mid", ratio: small.activeFrom, pointAlpha: 1 }, DEFAULT_THEME);
    expect(above.texts.map((t) => t.text)).toContain("Small Territory");
  });
});

describe("paint order", () => {
  it("paints every boundary, then a faded point pass, then every name", () => {
    const two: MapSpec = {
      version: "1",
      territories: [
        { id: "t1", name: "North", members: ["a", "b", "c"], centroid: [1, 1] },
        // Far enough from t1 (dy = 100) that its name's activeFrom stays
        // below ratio 1, so both names are visible for this order check.
        { id: "t2", name: "South", members: ["d", "e", "f"], centroid: [1, 101] },
      ],
      nodes: [
        { id: "a", label: "A", x: 0, y: 0, territory: "t1" },
        { id: "b", label: "B", x: 2, y: 0, territory: "t1" },
        { id: "c", label: "C", x: 1, y: 2, territory: "t1" },
        { id: "d", label: "D", x: 0, y: 100, territory: "t2" },
        { id: "e", label: "E", x: 2, y: 100, territory: "t2" },
        { id: "f", label: "F", x: 1, y: 102, territory: "t2" },
      ],
    };
    const s = new RecordingSurface();
    paintSpec(two, s, "mid");
    expect(s.calls).toEqual([
      "clear",
      "polygon",
      "polygon",
      "alpha",
      ...Array(6).fill("circle"),
      "alpha",
      "text",
      "text",
    ]);
  });

  it("paints boundaries then names, and no points, at the far regime", () => {
    const s = new RecordingSurface();
    paintSpec(spec, s, "far");
    expect(s.calls).toEqual(["clear", "polygon", "text"]);
  });
});

describe("metric 14: point overlap", () => {
  // Measured 2026-09-23 on generateCorpus({ seed: 1, size: 5000 }) fitted into
  // 960x640 (padding 24), then zoomed to DEFAULT_THRESHOLDS.midAt about that
  // fitted centre: 69.73% (0.6972704714640199) of the 806 on-screen points
  // have another on-screen point closer than 2 * DEFAULT_THEME.pointRadius.
  const MEASURED = 0.6972704714640199;

  it("keeps the share of overlapping points within MEASURED + 0.02", () => {
    const corpus = generateCorpus({ seed: 1, size: 5000 });
    const width = 960;
    const height = 640;
    const fit = fitSpec(corpus, width, height, 24);
    const ratio = DEFAULT_THRESHOLDS.midAt;
    const scale = fit.scale * ratio;
    const b = worldBounds(corpus);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const vp2 = { scale, tx: width / 2 - cx * scale, ty: height / 2 - cy * scale };
    const screenPoints = corpus.nodes
      .map((n) => [n.x * vp2.scale + vp2.tx, n.y * vp2.scale + vp2.ty] as [number, number])
      .filter(([x, y]) => x >= 0 && x <= width && y >= 0 && y <= height);

    const threshold = 2 * DEFAULT_THEME.pointRadius;
    let overlapping = 0;
    for (let i = 0; i < screenPoints.length; i += 1) {
      const [xi, yi] = screenPoints[i] as [number, number];
      for (let j = 0; j < screenPoints.length; j += 1) {
        if (i === j) continue;
        const [xj, yj] = screenPoints[j] as [number, number];
        if (Math.hypot(xi - xj, yi - yj) < threshold) {
          overlapping += 1;
          break;
        }
      }
    }
    const share = screenPoints.length === 0 ? 0 : overlapping / screenPoints.length;
    expect(share).toBeLessThanOrEqual(MEASURED + 0.02);
  });
});
