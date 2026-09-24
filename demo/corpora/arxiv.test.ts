import { describe, expect, it } from "vitest";
import { estimateText, LABEL_PADDING } from "../../src/labels/placement";
import { DEFAULT_THRESHOLDS } from "../../src/lod/lod";
import { fade, regimeAt } from "../../src/lod/regime";
import { paint } from "../../src/shared/paint";
import { buildScene } from "../../src/shared/scene";
import type { MapNode, MapSpec, Territory } from "../../src/shared/spec";
import { SpecError, validateSpec } from "../../src/shared/spec";
import { RecordingSurface } from "../../src/shared/surface";
import { DEFAULT_THEME } from "../../src/shared/theme";
import { DEFAULT_TUNING } from "../../src/shared/tuning";
import { fitSpec } from "../../src/viewport/fit";
// Imported as a JSON module (Vite/Vitest resolve these natively, no Node `fs` needed --
// this package has no `@types/node` dependency, being a browser-only library) rather than
// typed off the ~1.8 MB literal: `unknown` sidesteps TypeScript inferring a giant type for
// every one of the 8,000 nodes.
import rawSpecJson from "./arxiv.json";
import metaJson from "./arxiv.meta.json";

const rawSpec: unknown = rawSpecJson;
const meta: Record<string, unknown> = metaJson;

const ATTRIBUTION = "Thank you to arXiv for use of its open access interoperability.";

/** Every key present anywhere in `value`, walked recursively through objects and arrays. */
function collectKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, val] of Object.entries(value)) {
      keys.add(key);
      collectKeys(val, keys);
    }
  }
}

describe("the arXiv corpus", () => {
  it("passes the library's own validateSpec", () => {
    expect(() => validateSpec(rawSpec)).not.toThrow();
  });

  // Canary: proves the check above actually runs, rather than the corpus
  // just happening to be well-formed. Every territory the export produced
  // has at least FLOOR (20) member papers that claim it, so dropping any
  // one territory leaves those nodes pointing at an unknown territory id.
  it("canary: validateSpec throws once a territory is removed from a copy of the spec", () => {
    const spec = rawSpec as MapSpec;
    const broken = { ...spec, territories: spec.territories.slice(1) };
    expect(() => validateSpec(broken)).toThrow(SpecError);
  });

  it("has at least 5,000 nodes", () => {
    const spec = validateSpec(rawSpec);
    expect(spec.nodes.length).toBeGreaterThanOrEqual(5000);
  });

  it("has at least 30 territories", () => {
    const spec = validateSpec(rawSpec);
    expect(spec.territories.length).toBeGreaterThanOrEqual(30);
  });

  it("carries no author or authors key, at any depth", () => {
    const keys = new Set<string>();
    collectKeys(rawSpec, keys);
    for (const key of keys) {
      expect(key.toLowerCase()).not.toMatch(/^authors?$/);
    }
  });

  it("gives every node a meta.url that points at an arXiv abstract page", () => {
    const spec = validateSpec(rawSpec);
    expect(spec.nodes.length).toBeGreaterThan(0);
    for (const node of spec.nodes as MapNode[]) {
      const nodeMeta = node.meta as { url?: unknown } | undefined;
      expect(typeof nodeMeta?.url).toBe("string");
      expect(nodeMeta?.url as string).toMatch(/^https:\/\/arxiv\.org\/abs\//);
    }
  });

  it("every territory's members resolve and its centroid is finite (sanity on top of validateSpec)", () => {
    const spec = validateSpec(rawSpec);
    for (const territory of spec.territories as Territory[]) {
      expect(territory.members.length).toBeGreaterThan(0);
      expect(Number.isFinite(territory.centroid[0])).toBe(true);
      expect(Number.isFinite(territory.centroid[1])).toBe(true);
    }
  });

  it("arxiv.meta.json's attribution is exactly the arXiv sentence", () => {
    expect(meta.attribution).toBe(ATTRIBUTION);
  });
});

/**
 * Acceptance 2 of the showcase spec, automated: the demo opens on the real
 * arXiv corpus at the fitted view, in the far regime, with every drawn name
 * whole inside the box and no two names overlapping. Built through the
 * same pipeline `CorpusMap` uses (`buildScene`, `fitSpec` with its 24 px
 * padding, `paint`), with `estimateText` standing in for a real browser's
 * text metrics.
 */
describe("acceptance 2: the fitted arXiv view", () => {
  const spec = validateSpec(rawSpec);
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

  for (const [width, height] of [
    [1440, 900],
    [375, 812],
  ] as const) {
    it(`at ${width}x${height}: far regime, names drawn, none overlapping, none crossing the canvas edge`, () => {
      const regime = regimeAt(1, DEFAULT_THRESHOLDS, "far", DEFAULT_TUNING.hysteresis);
      expect(regime).toBe("far");

      const fit = fitSpec(spec, width, height, 24);
      const surface = new RecordingSurface();
      const pointAlpha = fade(1, DEFAULT_THRESHOLDS.midAt, DEFAULT_TUNING.fadeBand);
      paint(surface, scene, spec, fit, { regime, pointAlpha, width, height }, DEFAULT_THEME);

      const boxes = surface.texts.map((t) => ({ text: t.text, x: t.x, y: t.y, ...estimateText(t.text, t.font) }));
      expect(boxes.length).toBeGreaterThan(0);

      const crossing = boxes
        .filter(
          (b) =>
            b.x - b.width / 2 < 0 || b.x + b.width / 2 > width || b.y - b.height / 2 < 0 || b.y + b.height / 2 > height,
        )
        .map((b) => b.text);
      expect(crossing).toEqual([]);

      const overlapping: string[] = [];
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          if (!a || !b) continue;
          const ox = Math.abs(a.x - b.x) < (a.width + b.width) / 2 + LABEL_PADDING;
          const oy = Math.abs(a.y - b.y) < (a.height + b.height) / 2 + LABEL_PADDING;
          if (ox && oy) overlapping.push(`${a.text} / ${b.text}`);
        }
      }
      expect(overlapping).toEqual([]);
    });
  }
});
