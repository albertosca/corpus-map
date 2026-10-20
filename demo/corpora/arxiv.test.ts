import { describe, expect, it } from "vitest";
import { estimateText, LABEL_PADDING } from "../../src/labels/placement";
import { DEFAULT_THRESHOLDS } from "../../src/lod/lod";
import { regimeAt } from "../../src/lod/regime";
import { paint } from "../../src/shared/paint";
import { buildScene, type Scene } from "../../src/shared/scene";
import type { MapNode, MapSpec, Territory } from "../../src/shared/spec";
import { SpecError, validateSpec } from "../../src/shared/spec";
import { RecordingSurface } from "../../src/shared/surface";
import { DEFAULT_THEME } from "../../src/shared/theme";
import { DEFAULT_TUNING } from "../../src/shared/tuning";
import { fitScene } from "../../src/viewport/fitScene";
import { toScreen, type Viewport } from "../../src/viewport/viewport";
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
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
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

interface DrawnBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Every name `paint` draws for `viewport` into a `width` x `height` canvas, with its `estimateText` box. */
function drawnBoxes(spec: MapSpec, scene: Scene, viewport: Viewport, width: number, height: number): DrawnBox[] {
  const regime = regimeAt(1, DEFAULT_THRESHOLDS, "far", DEFAULT_TUNING.hysteresis);
  const surface = new RecordingSurface();
  paint(surface, scene, spec, viewport, { regime, pointAlpha: 0, width, height }, DEFAULT_THEME);
  return surface.texts.map((drawn) => ({
    text: drawn.text,
    x: drawn.x,
    y: drawn.y,
    ...estimateText(drawn.text, drawn.font),
  }));
}

function overlappingPairs(boxes: readonly DrawnBox[]): string[] {
  const pairs: string[] = [];
  for (let firstIndex = 0; firstIndex < boxes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < boxes.length; secondIndex += 1) {
      const first = boxes[firstIndex];
      const second = boxes[secondIndex];
      if (!first || !second) continue;
      const overlapsHorizontally = Math.abs(first.x - second.x) < (first.width + second.width) / 2 + LABEL_PADDING;
      const overlapsVertically = Math.abs(first.y - second.y) < (first.height + second.height) / 2 + LABEL_PADDING;
      if (overlapsHorizontally && overlapsVertically) pairs.push(`${first.text} / ${second.text}`);
    }
  }
  return pairs;
}

function crossesEdge(box: DrawnBox, width: number, height: number): boolean {
  return (
    box.x - box.width / 2 < 0 ||
    box.x + box.width / 2 > width ||
    box.y - box.height / 2 < 0 ||
    box.y + box.height / 2 > height
  );
}

/**
 * Acceptance 2 of the showcase spec, automated: the demo opens on the real
 * arXiv corpus at the fitted view, in the far regime, with names drawn and
 * no two of them overlapping. Built through the same pipeline `CorpusMap`
 * uses (`buildScene`, `fitScene` with its 24 px padding, `paint`), with
 * `estimateText` standing in for a real browser's text metrics.
 *
 * `fitScene` fits the territory shapes and the names drawn at the fitted
 * scale, so at both desktop and phone width every drawn name is whole on
 * the canvas: none crosses its edge.
 */
describe("acceptance 2: the fitted arXiv view", () => {
  const spec = validateSpec(rawSpec);
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

  it("the fitted view opens in the far regime", () => {
    expect(regimeAt(1, DEFAULT_THRESHOLDS, "far", DEFAULT_TUNING.hysteresis)).toBe("far");
  });

  for (const [width, height] of [
    [1440, 900],
    [375, 812],
  ] as const) {
    it(`at ${width}x${height}: names drawn, none overlapping, none crossing the canvas edge`, () => {
      const boxes = drawnBoxes(spec, scene, fitScene(spec, scene, width, height, 24), width, height);
      expect(boxes.length).toBeGreaterThan(0);
      expect(boxes.filter((box) => crossesEdge(box, width, height)).map((box) => box.text)).toEqual([]);
      expect(overlappingPairs(boxes)).toEqual([]);
    });
  }
});

/**
 * Map-feel section 4 and metric 7 on the real corpus, through `paint`: no
 * name vanishes on zoom in and none changes on pan. Pans the fitted view
 * (at ratios 1, 2 and 4) across its full width in 2 px steps, and zooms
 * about the centre by 1.1x per step up to 64x; a pop is a name drawn at
 * one step and missing at the next while its anchor is still on screen.
 * A visibility rule that depends on where a name sits (for example,
 * skipping a name whose box crosses the edge) makes names pop here.
 */
describe("no name pops out on pan or zoom (arXiv, painted)", () => {
  const spec = validateSpec(rawSpec);
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

  const aboutCentre = (fit: Viewport, width: number, height: number, ratio: number): Viewport => {
    const scale = fit.scale * ratio;
    return {
      scale,
      tx: width / 2 - ((width / 2 - fit.tx) / fit.scale) * scale,
      ty: height / 2 - ((height / 2 - fit.ty) / fit.scale) * scale,
    };
  };
  const anchorsOnScreen = (viewport: Viewport, width: number, height: number): Set<string> => {
    const out = new Set<string>();
    for (const placed of scene.labels) {
      if (viewport.scale < placed.activeFromScale) continue;
      const [horizontal, vertical] = toScreen(viewport, placed.anchor[0], placed.anchor[1]);
      if (horizontal >= 0 && horizontal <= width && vertical >= 0 && vertical <= height) out.add(placed.name);
    }
    return out;
  };

  for (const [width, height] of [
    [1440, 900],
    [375, 812],
  ] as const) {
    it(`at ${width}x${height}: 0 pops over the pan and zoom sweeps`, () => {
      const fit = fitScene(spec, scene, width, height, 24);
      const pops: string[] = [];
      let compared = 0;
      let crossedEdge = 0;
      const step = (label: string, before: DrawnBox[], viewport: Viewport): DrawnBox[] => {
        const now = drawnBoxes(spec, scene, viewport, width, height);
        const drawnNow = new Set(now.map((box) => box.text));
        const anchored = anchorsOnScreen(viewport, width, height);
        for (const box of before) {
          if (!anchored.has(box.text)) continue;
          compared += 1;
          if (!drawnNow.has(box.text)) pops.push(`${label} ${box.text}`);
        }
        crossedEdge += now.filter((box) => crossesEdge(box, width, height)).length;
        return now;
      };

      for (const ratio of [1, 2, 4]) {
        const base = aboutCentre(fit, width, height, ratio);
        let before = drawnBoxes(spec, scene, base, width, height);
        for (let offset = 2; offset <= width; offset += 2) {
          before = step(`pan r${ratio} dx${offset}`, before, { ...base, tx: base.tx + offset });
        }
      }
      let before = drawnBoxes(spec, scene, fit, width, height);
      for (let power = 1; 1.1 ** power <= 64; power += 1) {
        before = step(`zoom k${power}`, before, aboutCentre(fit, width, height, 1.1 ** power));
      }

      expect(pops).toEqual([]);
      // Non-vacuous: names were compared, and the sweeps did carry drawn
      // names across the canvas edge, where a position-dependent rule pops.
      expect(compared).toBeGreaterThan(0);
      expect(crossedEdge).toBeGreaterThan(0);
    });
  }
});
