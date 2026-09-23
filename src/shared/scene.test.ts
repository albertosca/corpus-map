import { describe, expect, it } from "vitest";
import { generateCorpus, TERRITORY_COUNT } from "../../fixtures/synthetic/generate";
import { estimateText, LABEL_PADDING } from "../labels/placement";
import { contains } from "../territories/shape";
import { fitSpec } from "../viewport/fit";
import { paint } from "./paint";
import { buildScene } from "./scene";
import type { MapSpec } from "./spec";
import { RecordingSurface } from "./surface";
import { DEFAULT_THEME } from "./theme";
import { DEFAULT_TUNING } from "./tuning";

describe("buildScene", () => {
  it("keeps a producer boundary verbatim instead of computing one", () => {
    const boundary: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    const spec: MapSpec = {
      version: "1",
      territories: [{ id: "t1", name: "Fixed", members: ["a"], centroid: [5, 5], boundary }],
      nodes: [{ id: "a", label: "A", x: 5, y: 5, territory: "t1" }],
    };
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(scene.shapes.get("t1")).toEqual([boundary]);
  });

  it("gives a 1-member territory one ring and a label anchored inside it", () => {
    const spec: MapSpec = {
      version: "1",
      territories: [
        // Wide-spread filler territory so the corpus extent (and thus the
        // fallback disk radius for the solo territory) is non-trivial.
        {
          id: "wide",
          name: "Wide",
          members: ["w1", "w2"],
          centroid: [50, 50],
        },
        { id: "solo", name: "Solo", members: ["a"], centroid: [40, 40] },
      ],
      nodes: [
        { id: "w1", label: "W1", x: 0, y: 0, territory: "wide" },
        { id: "w2", label: "W2", x: 100, y: 100, territory: "wide" },
        { id: "a", label: "A", x: 40, y: 40, territory: "solo" },
      ],
    };
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const rings = scene.shapes.get("solo");
    expect(rings).toHaveLength(1);
    const ring = rings?.[0];
    if (!ring) throw new Error("expected a ring");
    const label = scene.labels.find((l) => l.id === "solo");
    if (!label) throw new Error("expected a label");
    expect(contains(ring, label.anchor)).toBe(true);
  });

  it("gives a 2-member territory one ring and a label anchored inside it", () => {
    const spec: MapSpec = {
      version: "1",
      territories: [
        {
          id: "wide",
          name: "Wide",
          members: ["w1", "w2"],
          centroid: [50, 50],
        },
        { id: "pair", name: "Pair", members: ["a", "b"], centroid: [40, 40] },
      ],
      nodes: [
        { id: "w1", label: "W1", x: 0, y: 0, territory: "wide" },
        { id: "w2", label: "W2", x: 100, y: 100, territory: "wide" },
        { id: "a", label: "A", x: 39.75, y: 40, territory: "pair" },
        { id: "b", label: "B", x: 40.25, y: 40, territory: "pair" },
      ],
    };
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const rings = scene.shapes.get("pair");
    expect(rings).toHaveLength(1);
    const ring = rings?.[0];
    if (!ring) throw new Error("expected a ring");
    const label = scene.labels.find((l) => l.id === "pair");
    if (!label) throw new Error("expected a label");
    expect(contains(ring, label.anchor)).toBe(true);
  });

  it("gives a territory whose members resolve to nothing no ring and a label at its centroid", () => {
    const spec: MapSpec = {
      version: "1",
      territories: [{ id: "ghost", name: "Ghost", members: ["missing"], centroid: [7, 9] }],
      nodes: [],
    };
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(scene.shapes.get("ghost")).toEqual([]);
    const label = scene.labels.find((l) => l.id === "ghost");
    expect(label?.anchor).toEqual([7, 9]);
  });

  it("gives every territory one ring and a label on the 5,000-item synthetic corpus, deterministically", () => {
    const spec = generateCorpus({ seed: 1, size: 5000 });
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(scene.shapes.size).toBe(TERRITORY_COUNT);
    for (const t of spec.territories) {
      expect(scene.shapes.get(t.id)).toHaveLength(1);
    }
    expect(scene.labels).toHaveLength(TERRITORY_COUNT);

    const again = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(again.labels).toEqual(scene.labels);
  });

  // Map-feel acceptance 3, second half (spec 2, carried into spec 4 section
  // 3): built and painted through the real pipeline, not just checked at
  // `placeLabels` level, so a defect anywhere between `buildScene` and
  // `paintLabels` (e.g. the wrong field read at paint time) would show here
  // too.
  it("acceptance 3: no two drawn names overlap at the fitted view of the 5,000-item synthetic corpus", () => {
    const corpus = generateCorpus({ seed: 1, size: 5000 });
    const width = 1280;
    const height = 800;
    const fit = fitSpec(corpus, width, height, 24);
    const scene = buildScene(corpus, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const surface = new RecordingSurface();
    paint(surface, scene, corpus, fit, { regime: "far", pointAlpha: 0 }, DEFAULT_THEME);

    expect(surface.texts.length).toBeGreaterThan(0);
    const boxes = surface.texts.map((t) => {
      const { width: w, height: h } = estimateText(t.text, t.font);
      return { x: t.x, y: t.y, w, h };
    });
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a || !b) continue;
        const ox = Math.abs(a.x - b.x) < (a.w + b.w) / 2 + LABEL_PADDING;
        const oy = Math.abs(a.y - b.y) < (a.h + b.h) / 2 + LABEL_PADDING;
        expect(ox && oy).toBe(false);
      }
    }
  });
});
