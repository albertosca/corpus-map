import { describe, expect, it } from "vitest";
import { nearestTo, neighbourInDirection } from "../../src/a11y/spatialNeighbour";
import { DEFAULT_ITEM_LABEL_FONT, placeItemLabels } from "../../src/labels/itemLabels";
import { drawnItemLabels, itemLabelRect, paintItemLabels } from "../../src/labels/paintItemLabels";
import { estimateText, LABEL_PADDING, type PlacedLabel } from "../../src/labels/placement";
import { DEFAULT_THRESHOLDS } from "../../src/lod/lod";
import { fade, groupNameAlpha, regimeAt } from "../../src/lod/regime";
import { usableArea } from "../../src/shared/insets";
import { paint } from "../../src/shared/paint";
import { buildScene, GROUP_LETTER_SPACING, groupLabelsFor, NARROW_BOX_WIDTH, type Scene } from "../../src/shared/scene";
import type { MapNode, MapSpec, Territory } from "../../src/shared/spec";
import { SpecError, validateSpec } from "../../src/shared/spec";
import { RecordingSurface } from "../../src/shared/surface";
import { DEFAULT_THEME } from "../../src/shared/theme";
import { DEFAULT_TUNING } from "../../src/shared/tuning";
import { fitScene } from "../../src/viewport/fitScene";
import { toScreen, type Viewport } from "../../src/viewport/viewport";
import { drawnName } from "../../test/drawnName";
// Imported as a JSON module (Vite/Vitest resolve these natively, no Node `fs` needed --
// this package has no `@types/node` dependency, being a browser-only library) rather than
// typed off the ~1.5 MB literal: `unknown` sidesteps TypeScript inferring a giant type for
// every one of the 8,000 nodes.
import rawSpecJson from "./arxiv.json";
import metaJson from "./arxiv.meta.json";
import { withExpandedArxiv } from "./compact";
import { arxivSpec } from "./index";

const rawSpec: unknown = withExpandedArxiv(rawSpecJson);
/** What the demo loads: the corpus with its compact parts expanded, validated. */
const shippedSpec: MapSpec = arxivSpec(rawSpecJson);
const meta: Record<string, unknown> = metaJson;

const ATTRIBUTION = "Thank you to arXiv for use of its open access interoperability.";

/** The blind test's floors (`pipeline/arxiv/src/arxiv_corpus/blind.py`, spec §2.3 as amended 2026-10-28). */
const LEAF_FLOOR = 0.25;
const OVERALL_FLOOR = 0.6;
const GROUP_FLOOR = 0.7;

interface Attempt {
  names: Record<string, string>;
  overall: number;
  shares: Record<string, number | null>;
}

interface LevelReport {
  passed: boolean;
  names: Record<string, string>;
  attempts: Attempt[];
}

const naming = meta.naming as { model: string; check: { passed: boolean; leaves: LevelReport; groups: LevelReport } };

const leavesOf = (spec: MapSpec): Territory[] => spec.territories.filter((territory) => territory.parent !== undefined);
const familiesOf = (spec: MapSpec): Territory[] =>
  spec.territories.filter((territory) => territory.parent === undefined);

/**
 * Share of each node's `neighbours` nearest map neighbours (itself excluded)
 * that sit in its own territory, over the whole corpus: the pipeline's
 * `contiguity`, by brute force so the test needs no index.
 */
function contiguity(nodes: readonly MapNode[], neighbours: number): number {
  let same = 0;
  for (const [index, node] of nodes.entries()) {
    const nearestDistances: number[] = [];
    const nearestIndices: number[] = [];
    for (const [otherIndex, other] of nodes.entries()) {
      if (otherIndex === index) continue;
      const distance = (other.x - node.x) ** 2 + (other.y - node.y) ** 2;
      if (nearestDistances.length === neighbours && distance >= (nearestDistances[neighbours - 1] ?? 0)) continue;
      let position = nearestDistances.length;
      while (position > 0 && (nearestDistances[position - 1] ?? 0) > distance) position -= 1;
      nearestDistances.splice(position, 0, distance);
      nearestIndices.splice(position, 0, otherIndex);
      if (nearestDistances.length > neighbours) {
        nearestDistances.pop();
        nearestIndices.pop();
      }
    }
    for (const nearest of nearestIndices) if (nodes[nearest]?.territory === node.territory) same += 1;
  }
  return same / (nodes.length * neighbours);
}

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
  // just happening to be well-formed. Every leaf the export produced has
  // member papers that claim it, so dropping one leaves those nodes
  // pointing at an unknown territory id.
  it("canary: validateSpec throws once a leaf is removed from a copy of the spec", () => {
    const spec = rawSpec as MapSpec;
    const [firstLeaf] = leavesOf(spec);
    const broken = { ...spec, territories: spec.territories.filter((territory) => territory !== firstLeaf) };
    expect(() => validateSpec(broken)).toThrow(SpecError);
  });

  it("has at least 5,000 nodes", () => {
    const spec = validateSpec(rawSpec);
    expect(spec.nodes.length).toBeGreaterThanOrEqual(5000);
  });

  it("has 18-26 leaves, each under a declared family, in 5-9 families that hold no papers themselves", () => {
    const spec = validateSpec(rawSpec);
    const leaves = leavesOf(spec);
    const families = familiesOf(spec);
    expect(leaves.length).toBeGreaterThanOrEqual(18);
    expect(leaves.length).toBeLessThanOrEqual(26);
    expect(families.length).toBeGreaterThanOrEqual(5);
    expect(families.length).toBeLessThanOrEqual(9);
    const familyIds = new Set(families.map((family) => family.id));
    for (const leaf of leaves) expect(familyIds.has(leaf.parent ?? "")).toBe(true);
    for (const family of families) expect(family.members).toEqual([]);
    for (const family of families) expect(leaves.some((leaf) => leaf.parent === family.id)).toBe(true);
  });

  it("keeps each paper's arXiv category as node meta, from the arXiv category table", () => {
    const spec = validateSpec(rawSpec);
    const categories = new Set<string>();
    for (const node of spec.nodes) {
      const category = (node.meta as { category?: { id?: unknown; name?: unknown } } | undefined)?.category;
      expect(typeof category?.id).toBe("string");
      expect(category?.id as string).toMatch(/^cs\.[A-Z]{2}$/);
      expect(typeof category?.name).toBe("string");
      categories.add(category?.id as string);
    }
    // The categories cut across the territories: far more of them than leaves.
    expect(categories.size).toBeGreaterThan(leavesOf(spec).length);
  });

  it("territories are spatially contiguous: at least 90% of each paper's 10 nearest neighbours share its leaf", () => {
    const spec = validateSpec(rawSpec);
    expect(contiguity(spec.nodes, 10)).toBeGreaterThanOrEqual(0.9);
  });

  it("canary: contiguity falls far below 0.90 once the leaves are dealt out round-robin", () => {
    const spec = validateSpec(rawSpec);
    const leafIds = leavesOf(spec).map((leaf) => leaf.id);
    const shuffled = spec.nodes.map((node, index) => ({ ...node, territory: leafIds[index % leafIds.length] ?? "" }));
    expect(contiguity(shuffled, 10)).toBeLessThan(0.2);
  });

  it("its names passed the pipeline's blind test, at the floors spec §2.3 sets", () => {
    expect(naming.check.passed).toBe(true);
    const spec = validateSpec(rawSpec);
    const leaves = naming.check.leaves;
    const groups = naming.check.groups;
    expect(leaves.passed).toBe(true);
    expect(groups.passed).toBe(true);
    const lastLeaves = leaves.attempts[leaves.attempts.length - 1];
    const lastGroups = groups.attempts[groups.attempts.length - 1];
    expect(lastLeaves?.names).toEqual(leaves.names);
    expect(lastGroups?.names).toEqual(groups.names);
    expect(lastLeaves?.overall).toBeGreaterThanOrEqual(OVERALL_FLOOR);
    // A null share is a cluster with no held-out titles: the pipeline's gate cannot fail it, so it must
    // never ship untested; every shipped id has a share, and each share clears its floor.
    const tested = (shares: Record<string, number | null> | undefined) =>
      Object.entries(shares ?? {}).map(([identifier, share]) => {
        expect(share, `${identifier} was never tested`).not.toBeNull();
        return share as number;
      });
    expect(Object.keys(lastLeaves?.shares ?? {}).sort()).toEqual(Object.keys(leaves.names).sort());
    expect(Object.keys(lastGroups?.shares ?? {}).sort()).toEqual(Object.keys(groups.names).sort());
    for (const share of tested(lastLeaves?.shares)) expect(share).toBeGreaterThanOrEqual(LEAF_FLOOR);
    for (const share of tested(lastGroups?.shares)) expect(share).toBeGreaterThanOrEqual(GROUP_FLOOR);
    // The tested names are the shipped names, level for level.
    const shipped = (territories: Territory[]) =>
      Object.fromEntries(territories.map((territory) => [territory.id, territory.name]));
    expect(shipped(leavesOf(spec))).toEqual(leaves.names);
    expect(shipped(familiesOf(spec))).toEqual(groups.names);
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

  it("every leaf has members, and every territory's centroid is finite (sanity on top of validateSpec)", () => {
    const spec = validateSpec(rawSpec);
    for (const leaf of leavesOf(spec)) expect(leaf.members.length).toBeGreaterThan(0);
    for (const territory of spec.territories as Territory[]) {
      expect(Number.isFinite(territory.centroid[0])).toBe(true);
      expect(Number.isFinite(territory.centroid[1])).toBe(true);
    }
  });

  it("ships edges, every one across two arXiv categories, at most six per item", () => {
    const spec = validateSpec(rawSpec);
    const categoryOf = new Map(
      spec.nodes.map((node) => [node.id, (node.meta as { category?: { id?: string } } | undefined)?.category?.id]),
    );
    const degrees = new Map<string, number>();
    const edges = spec.edges ?? [];
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      expect(categoryOf.get(edge.source)).toBeDefined();
      expect(categoryOf.get(edge.source)).not.toBe(categoryOf.get(edge.target));
      degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
    }
    expect(Math.max(...degrees.values())).toBeLessThanOrEqual(6);
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

/** The fitted view `CorpusMap` opens on: the family names it counts are the ones a box this wide draws. */
function fitAt(spec: MapSpec, scene: Scene, width: number, height: number): Viewport {
  return fitScene(spec, { ...scene, groupLabels: groupLabelsFor(scene, width) }, width, height, 24);
}

/** Every name `paint` draws for `viewport` into a `width` x `height` canvas, with its `estimateText` box. */
function drawnBoxes(
  spec: MapSpec,
  scene: Scene,
  viewport: Viewport,
  width: number,
  height: number,
  ratio: number,
): DrawnBox[] {
  const regime = regimeAt(1, DEFAULT_THRESHOLDS, "far", DEFAULT_TUNING.hysteresis);
  // The group alpha `CorpusMap` computes for this ratio in far.
  const groupAlpha = 1 - fade(ratio, DEFAULT_TUNING.groupNamesUntil, DEFAULT_TUNING.fadeBand);
  const surface = new RecordingSurface();
  const frame = { regime, pointAlpha: 0, width, height, groupAlpha, compactGroupNames: width < NARROW_BOX_WIDTH };
  paint(surface, scene, spec, viewport, frame, DEFAULT_THEME);
  return surface.texts.map((drawn) => {
    const measured = estimateText(drawn.text, drawn.font);
    const spacing = drawn.letterSpacing === undefined ? 0 : Number.parseFloat(drawn.letterSpacing) * drawn.text.length;
    return { text: drawn.text, x: drawn.x, y: drawn.y, width: measured.width + spacing, height: measured.height };
  });
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

/** `fit` zoomed by `ratio` about the box centre. */
function aboutCentre(fit: Viewport, width: number, height: number, ratio: number): Viewport {
  const scale = fit.scale * ratio;
  return {
    scale,
    tx: width / 2 - ((width / 2 - fit.tx) / fit.scale) * scale,
    ty: height / 2 - ((height / 2 - fit.ty) / fit.scale) * scale,
  };
}

/** The family names the pipeline wrote, as the fitted view draws them. */
describe("the arXiv family names", () => {
  // The smallest box the fit tests (demo/corpora/fit.test.ts) minus the fit's
  // 24 px padding: a wider name can never sit whole inside the fitted view.
  it("each declared group name fits a phone: 320 px minus the fit's 24 px padding, in the group-name style", () => {
    const font = DEFAULT_THEME.territoryFonts.large;
    const tooWide = familiesOf(shippedSpec)
      .map((family) => ({
        name: family.name,
        width:
          estimateText(drawnName(family.name), font).width +
          (DEFAULT_THEME.territoryNameStyle?.spacing ?? GROUP_LETTER_SPACING) * family.name.length,
      }))
      .filter((measured) => measured.width > 320 - 2 * 24);
    expect(tooWide).toEqual([]);
  });
});

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
  const spec = shippedSpec;
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

  it("the fitted view opens in the far regime", () => {
    expect(regimeAt(1, DEFAULT_THRESHOLDS, "far", DEFAULT_TUNING.hysteresis)).toBe("far");
  });

  it("groups the leaves in their declared families, every leaf in exactly one", () => {
    const families = familiesOf(spec);
    expect(scene.groups.map((group) => group.name).sort()).toEqual(families.map((family) => family.name).sort());
    const memberships = scene.groups.flatMap((group) => group.members);
    expect([...memberships].sort()).toEqual(
      leavesOf(spec)
        .map((leaf) => leaf.id)
        .sort(),
    );
  });

  it("at 1440x900 every family name is drawn at the fitted view (acceptance 3)", () => {
    const boxes = drawnBoxes(spec, scene, fitAt(spec, scene, 1440, 900), 1440, 900, 1);
    const drawn = new Set(boxes.map((box) => box.text));
    expect(
      familiesOf(spec)
        .filter((family) => !drawn.has(drawnName(family.name)))
        .map((family) => family.name),
    ).toEqual([]);
  });

  // Spec mobile §4: below a 600 px box the family names are drawn compact, so
  // a phone shows every family at the fitted view, a small phone all but one.
  for (const [width, height, allowedMissing] of [
    [1440, 900, 0],
    [375, 812, 0],
    [320, 568, 1],
  ] as const) {
    it(`at ${width}x${height} at most ${allowedMissing} family name is missing at the fitted view`, () => {
      const drawn = new Set(
        drawnBoxes(spec, scene, fitAt(spec, scene, width, height), width, height, 1).map((box) => box.text),
      );
      const missing = familiesOf(spec)
        .filter((family) => !drawn.has(drawnName(family.name)))
        .map((family) => family.name);
      expect(missing.length).toBeLessThanOrEqual(allowedMissing);
    });
  }

  // Spec fit-insets §5.1 and §5.4: a fit beside the demo's drawer (400 px) keeps the corpus whole inside the area the
  // drawer leaves free, in the far regime, with every family name drawn whole there and none overlapping.
  it("at 1440x900 beside a 400 px drawer the fit sits inside the free area, far, with every family name whole", () => {
    const area = usableArea(1440, 900, { top: 0, right: 400, bottom: 0, left: 0 });
    const labelled = { ...scene, groupLabels: groupLabelsFor(scene, 1440) };
    const whole = fitScene(spec, labelled, 1440, 900, 24);
    const beside = fitScene(spec, labelled, 1440, 900, 24, { groupNames: true }, area);
    const ratio = beside.scale / whole.scale;
    expect(ratio).toBeLessThanOrEqual(1);
    expect(regimeAt(ratio, DEFAULT_THRESHOLDS, "far", DEFAULT_TUNING.hysteresis)).toBe("far");
    const boxes = drawnBoxes(spec, scene, beside, 1440, 900, ratio);
    const drawn = new Set(boxes.map((box) => box.text));
    expect(
      familiesOf(spec)
        .filter((family) => !drawn.has(drawnName(family.name)))
        .map((family) => family.name),
    ).toEqual([]);
    expect(boxes.filter((box) => box.x + box.width / 2 > area.left + area.width).map((box) => box.text)).toEqual([]);
    expect(overlappingPairs(boxes)).toEqual([]);
  });

  for (const [width, height] of [
    [1440, 900],
    [375, 812],
    [320, 568],
  ] as const) {
    it(`at ${width}x${height}: names drawn, none overlapping, none crossing the canvas edge`, () => {
      const boxes = drawnBoxes(spec, scene, fitAt(spec, scene, width, height), width, height, 1);
      expect(boxes.length).toBeGreaterThan(0);
      // The fitted view names groups.
      expect(boxes.some((box) => scene.groupLabels.some((label) => drawnName(label.name) === box.text))).toBe(true);
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
  const spec = shippedSpec;
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

  const anchorsOnScreen = (
    names: readonly PlacedLabel[],
    viewport: Viewport,
    width: number,
    height: number,
  ): Set<string> => {
    const out = new Set<string>();
    for (const placed of names) {
      if (viewport.scale < placed.activeFromScale) continue;
      const [horizontal, vertical] = toScreen(viewport, placed.anchor[0], placed.anchor[1]);
      if (horizontal >= 0 && horizontal <= width && vertical >= 0 && vertical <= height)
        out.add(drawnName(placed.name));
    }
    return out;
  };

  for (const [width, height] of [
    [1440, 900],
    [375, 812],
    [320, 568],
  ] as const) {
    it(`at ${width}x${height}: 0 pops over the pan and zoom sweeps`, () => {
      const fit = fitAt(spec, scene, width, height);
      const pops: string[] = [];
      let compared = 0;
      let crossedEdge = 0;
      // A pan never changes the ratio, so every name drawn counts, group names
      // included; a zoom counts territory names only: a group name fading out
      // above `groupNamesUntil` is the designed cross-fade, not a pop.
      const step = (
        label: string,
        before: DrawnBox[],
        viewport: Viewport,
        ratio: number,
        names: readonly PlacedLabel[],
      ): DrawnBox[] => {
        const now = drawnBoxes(spec, scene, viewport, width, height, ratio);
        const drawnNow = new Set(now.map((box) => box.text));
        const anchored = anchorsOnScreen(names, viewport, width, height);
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
        let before = drawnBoxes(spec, scene, base, width, height, ratio);
        for (let offset = 2; offset <= width; offset += 2) {
          before = step(`pan r${ratio} dx${offset}`, before, { ...base, tx: base.tx + offset }, ratio, [
            ...scene.labels,
            ...groupLabelsFor(scene, width),
          ]);
        }
      }
      let before = drawnBoxes(spec, scene, fit, width, height, 1);
      for (let power = 1; 1.1 ** power <= 64; power += 1) {
        before = step(
          `zoom k${power}`,
          before,
          aboutCentre(fit, width, height, 1.1 ** power),
          1.1 ** power,
          scene.labels,
        );
      }

      expect(pops).toEqual([]);
      // Non-vacuous: names were compared, and the sweeps did carry drawn
      // names across the canvas edge, where a position-dependent rule pops.
      expect(compared).toBeGreaterThan(0);
      expect(crossedEdge).toBeGreaterThan(0);
    });
  }
});

/**
 * Spec slice E §4 on the real corpus: zooming from the fitted view to twice
 * it, the family layer hands over to the leaf layer as a cross-fade, so no
 * fill layer's alpha jumps by more than half the fill between frames.
 */
describe("metric 18: no pop at the family swap (arXiv, painted)", () => {
  const spec = shippedSpec;
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  const options = {
    midAt: DEFAULT_THRESHOLDS.midAt,
    groupNamesUntil: DEFAULT_TUNING.groupNamesUntil,
    fadeBand: DEFAULT_TUNING.fadeBand,
    hysteresis: DEFAULT_TUNING.hysteresis,
  };
  const steps = 40;

  for (const [width, height] of [
    [1440, 900],
    [375, 812],
  ] as const) {
    it(`metric 18: no pop at the family swap at ${width}x${height}`, () => {
      const fit = fitAt(spec, scene, width, height);
      let regime = regimeAt(1, DEFAULT_THRESHOLDS, "far", DEFAULT_TUNING.hysteresis);
      let previous: number[] | null = null;
      const jumps: string[] = [];
      for (let index = 0; index <= steps; index += 1) {
        const ratio = 2 ** (index / steps);
        regime = regimeAt(ratio, DEFAULT_THRESHOLDS, regime, DEFAULT_TUNING.hysteresis);
        const groupAlpha = groupNameAlpha(ratio, regime, options);
        const viewport = { scale: fit.scale * ratio, tx: fit.tx, ty: fit.ty };
        const surface = new RecordingSurface();
        paint(surface, scene, spec, viewport, { regime, pointAlpha: 0, width, height, groupAlpha }, DEFAULT_THEME);
        // Leaves first, families second: a missing layer counts as alpha 0.
        const layers =
          surface.layers.length === 2
            ? surface.layers
            : groupAlpha >= 1
              ? [0, surface.layers[0] ?? 0]
              : [surface.layers[0] ?? 0, 0];
        if (previous !== null)
          for (const [layer, alpha] of layers.entries()) {
            const jump = Math.abs(alpha - (previous[layer] ?? 0));
            if (jump > DEFAULT_THEME.territoryFillAlpha * 0.5)
              jumps.push(`ratio ${ratio.toFixed(3)} layer ${layer}: ${jump}`);
          }
        previous = layers;
      }
      expect(jumps).toEqual([]);
      // The sweep crosses the swap: it starts on families alone and ends on leaves.
      expect(groupNameAlpha(1, "far", options)).toBe(1);
      expect(
        groupNameAlpha(2, regimeAt(2, DEFAULT_THRESHOLDS, "far", DEFAULT_TUNING.hysteresis), options),
      ).toBeLessThan(1);
    });
  }
});

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function rectsOverlap(first: Rect, second: Rect): boolean {
  return (
    first.left < second.left + second.width &&
    second.left < first.left + first.width &&
    first.top < second.top + second.height &&
    second.top < first.top + first.height
  );
}

describe("item labels on the arXiv corpus (painted model)", () => {
  const spec = shippedSpec;
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  const labels = placeItemLabels(
    spec,
    scene.labels,
    { font: DEFAULT_ITEM_LABEL_FONT, width: DEFAULT_TUNING.itemLabelWidth, lines: DEFAULT_TUNING.itemLabelLines },
    estimateText,
  );

  for (const [width, height] of [
    [1440, 900],
    [375, 812],
  ] as const)
    for (const ratio of [4, 8, 16])
      it(`at ${width}x${height}, ratio ${ratio}: no two drawn labels overlap, none overlaps a drawn name`, () => {
        const fit = fitAt(spec, scene, width, height);
        const viewport = aboutCentre(fit, width, height, ratio);
        const box = { width, height, dimmed: new Set<string>() };
        const plates = drawnItemLabels(labels, viewport, box)
          .map((label) => itemLabelRect(label, viewport))
          .filter(
            (rect) =>
              rect.left < width && rect.top < height && rect.left + rect.width > 0 && rect.top + rect.height > 0,
          );
        expect(plates.length).toBeGreaterThan(0);
        for (const [index, plate] of plates.entries())
          for (const other of plates.slice(index + 1)) expect(rectsOverlap(plate, other)).toBe(false);
        const names = drawnBoxes(spec, scene, viewport, width, height, ratio).map((name) => ({
          left: name.x - name.width / 2,
          top: name.y - name.height / 2,
          width: name.width,
          height: name.height,
        }));
        for (const plate of plates) for (const name of names) expect(rectsOverlap(plate, name)).toBe(false);
      });

  for (const [width, height] of [
    [1440, 900],
    [375, 812],
  ] as const)
    it(`at ${width}x${height}: over a pan at near, the painted plates are the drawn set clipped only by the canvas`, () => {
      const fit = fitAt(spec, scene, width, height);
      const base = aboutCentre(fit, width, height, 8);
      const box = { width, height, dimmed: new Set<string>() };
      const reference = drawnItemLabels(labels, base, box)
        .map((label) => label.id)
        .join("|");
      // A label pops when its plate is on the canvas in one frame and not painted there: so every
      // frame must paint exactly the plates of the position-blind drawn set that touch the canvas.
      for (let offset = 0; offset <= width; offset += 8) {
        const viewport = { ...base, tx: base.tx + offset };
        const drawn = drawnItemLabels(labels, viewport, box);
        expect(drawn.map((label) => label.id).join("|")).toBe(reference);
        const visible = drawn
          .map((label) => itemLabelRect(label, viewport))
          .filter(
            (rect) =>
              rect.left <= width && rect.top <= height && rect.left + rect.width >= 0 && rect.top + rect.height >= 0,
          )
          .map((rect) => `${rect.left},${rect.top}`)
          .sort();
        const surface = new RecordingSurface();
        paintItemLabels(surface, labels, viewport, DEFAULT_THEME, box);
        expect(surface.plates.map((plate) => `${plate.left},${plate.top}`).sort()).toEqual(visible);
      }
      expect(reference.length).toBeGreaterThan(0);
    });
});

function boundsOfNodes(nodes: readonly MapNode[]): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: Math.min(...nodes.map((node) => node.x)),
    maxX: Math.max(...nodes.map((node) => node.x)),
    minY: Math.min(...nodes.map((node) => node.y)),
    maxY: Math.max(...nodes.map((node) => node.y)),
  };
}

describe("walking the arXiv corpus with the arrows (spec spatial keys acceptance 3)", () => {
  it("never throws, never leaves the corpus, and reaches many distinct items", () => {
    const nodes = shippedSpec.nodes;
    const ids = new Set(nodes.map((node) => node.id));
    const bounds = boundsOfNodes(nodes);
    let current = nearestTo(nodes, (bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
    if (current === null) throw new Error("expected a node");
    const reached = new Set([current.id]);
    for (const direction of ["right", "down", "left", "up"] as const) {
      for (let press = 0; press < 200; press += 1) {
        const next = neighbourInDirection(current, nodes, direction);
        if (next === null) break;
        expect(ids.has(next.id)).toBe(true);
        expect(next.id).not.toBe(current.id);
        current = next;
        reached.add(current.id);
      }
    }
    expect(reached.size).toBeGreaterThan(100);
  });

  it("never selects an item of a dimmed territory, even from its live neighbours", () => {
    const hidden = leavesOf(shippedSpec)[0];
    if (hidden === undefined) throw new Error("expected a leaf territory");
    // The surface walks `liveSpec.nodes`: the spec with the dimmed territories' nodes removed.
    const nodes = shippedSpec.nodes.filter((node) => node.territory !== hidden.id);
    const ids = new Set(nodes.map((node) => node.id));
    // Start beside the hidden items, where a walk over every node would step into them.
    const hiddenNodes = shippedSpec.nodes.filter((node) => node.territory === hidden.id).slice(0, 50);
    expect(hiddenNodes.length).toBeGreaterThan(0);
    for (const hiddenNode of hiddenNodes) {
      const origin = nearestTo(nodes, hiddenNode.x, hiddenNode.y);
      if (origin === null) throw new Error("expected a node");
      for (const direction of ["right", "down", "left", "up"] as const) {
        const next = neighbourInDirection(origin, nodes, direction);
        if (next !== null) expect(ids.has(next.id)).toBe(true);
      }
    }
  });
});

/**
 * Far-regime visited state (spec `2026-11-06-far-visited-design.md`) on the real corpus: a visited subset fills
 * territories fuller at far in few distinct levels, changes no name, and leaves near at the base alpha.
 */
describe("visited subset (arXiv, painted)", () => {
  const leafIds = leavesOf(shippedSpec).map((territory) => territory.id);
  // Leaf 0 is entirely visited, leaf 1 half, leaf 2 a quarter, the rest none: every member of a leaf is visited by its position.
  const visitedShareByLeaf = new Map<string, number>([
    [leafIds[0] ?? "", 1],
    [leafIds[1] ?? "", 0.5],
    [leafIds[2] ?? "", 0.25],
  ]);
  const visitedSpec: MapSpec = (() => {
    const seen = new Map<string, number>();
    const nodes: MapNode[] = shippedSpec.nodes.map((node) => {
      const share = node.territory === null ? 0 : (visitedShareByLeaf.get(node.territory) ?? 0);
      const position = seen.get(node.territory ?? "") ?? 0;
      seen.set(node.territory ?? "", position + 1);
      const visited = Math.floor((position + 1) * share) > Math.floor(position * share);
      return share === 1 || visited ? { ...node, state: "visited" as const } : node;
    });
    return { ...shippedSpec, nodes };
  })();
  const plainScene = buildScene(shippedSpec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  const visitedScene = buildScene(visitedSpec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

  const paintedAt = (scene: Scene, spec: MapSpec, regime: "far" | "near", pointAlpha: number): RecordingSurface => {
    const surface = new RecordingSurface();
    const fit = fitAt(spec, scene, 1440, 900);
    paint(
      surface,
      scene,
      spec,
      fit,
      { regime, pointAlpha, width: 1440, height: 900, groupAlpha: 0, compactGroupNames: false },
      DEFAULT_THEME,
    );
    return surface;
  };

  it("measures a visited share on the subset's leaves and none elsewhere", () => {
    expect(visitedScene.visitedShare.get(leafIds[0] ?? "")).toBe(1);
    expect(visitedScene.visitedShare.get(leafIds[3] ?? "")).toBeUndefined();
    expect(plainScene.visitedShare.size).toBe(0);
  });

  it("fills in one layer at the strongest alpha, in at most five distinct steps, erasing under each shape", () => {
    const surface = paintedAt(visitedScene, visitedSpec, "far", 0);
    expect(surface.layers).toHaveLength(1);
    expect(surface.layers[0]).toBeCloseTo(DEFAULT_THEME.territoryFillAlpha * 1.5, 6);
    const steps = new Set(surface.alphas.map((alpha) => alpha.toFixed(6)));
    expect(steps.size).toBeGreaterThan(1);
    expect(steps.size).toBeLessThanOrEqual(5);
    expect(surface.erased).toHaveLength(leafIds.length);
  });

  it("draws the base alpha only at near, where the points carry the state", () => {
    const surface = paintedAt(visitedScene, visitedSpec, "near", 1);
    expect(surface.layers).toEqual([DEFAULT_THEME.territoryFillAlpha]);
    expect(surface.erased).toHaveLength(0);
  });

  it("draws the same names with and without visited nodes (the fill never moves a name)", () => {
    const fit = fitAt(shippedSpec, plainScene, 1440, 900);
    const without = drawnBoxes(shippedSpec, plainScene, fit, 1440, 900, 1).map((box) => box.text);
    const withVisited = drawnBoxes(visitedSpec, visitedScene, fit, 1440, 900, 1).map((box) => box.text);
    expect(withVisited).toEqual(without);
  });
});
