import { describe, expect, it } from "vitest";
import { generateCorpus, TERRITORY_COUNT } from "../../fixtures/synthetic/generate";
import { nestedSpec, singleChildSpec } from "../../test/specs";
import { estimateText, LABEL_PADDING, type PlacedLabel } from "../labels/placement";
import { tintDirection } from "../territories/familyColours";
import { deriveTerritoryGroups, type TerritoryGroup } from "../territories/groups";
import { contains } from "../territories/shape";
import { TINT_STEPS, tint, tintBand } from "../territories/tint";
import { fitSpec } from "../viewport/fit";
import { paint } from "./paint";
import {
  buildingScene,
  buildScene,
  GROUP_LETTER_SPACING,
  groupLabelsFor,
  NARROW_BOX_WIDTH,
  SCENE_POINTS_PER_STEP,
} from "./scene";
import { type MapSpec, validateSpec } from "./spec";
import { advance } from "./steps";
import { RecordingSurface } from "./surface";
import { DARK_THEME, DEFAULT_COMPACT_GROUP_FONT, DEFAULT_THEME as LOOK_THEME, type Theme } from "./theme";
import { DEFAULT_TUNING } from "./tuning";

// These tests are about painting rules, not the look: the style-less theme keeps the real-case text and the
// 1 px family spacing they assert. The look itself is pinned in theme.test.ts and the name-style tests.
const DEFAULT_THEME: Theme = { ...LOOK_THEME, territoryNameStyle: undefined };

describe("buildScene", () => {
  it("builds in steps, one per region outlined, one for the colours and one per name set, to the same scene (spec mobile §7)", () => {
    const spec = nestedSpec();
    const steps = buildingScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    // Leaves a and b (six points each) and family p (twelve): two steps each; then the colours and three name sets.
    expect(advance(steps, 10)).toEqual({ done: false });
    expect(advance(steps, 1)).toEqual({
      done: true,
      value: buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText),
    });
  });

  it("weighs an outline's steps by its points, so a slice holds about the same work on any corpus (spec mobile §7)", () => {
    const count = 2 * SCENE_POINTS_PER_STEP + 1;
    const nodes = Array.from({ length: count }, (_, index) => ({
      id: `n${index}`,
      label: `N ${index}`,
      x: index % 10,
      y: Math.floor(index / 10),
      territory: "t",
    }));
    const spec = validateSpec({
      version: "1",
      territories: [{ id: "t", name: "T", members: nodes.map((node) => node.id), centroid: [5, 5] }],
      nodes,
    });
    const steps = buildingScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    // One region of 2 × SCENE_POINTS_PER_STEP + 1 points: one step plus three; then the colours and three name sets.
    expect(advance(steps, 8)).toEqual({ done: false });
    expect(advance(steps, 1).done).toBe(true);
  });

  it("yields a region's steps before outlining it, so a slice smaller than the region outlines nothing (spec mobile §7)", () => {
    const count = 2 * SCENE_POINTS_PER_STEP + 1;
    const nodes = Array.from({ length: count }, (_, index) => ({
      id: `n${index}`,
      label: `N ${index}`,
      x: index % 10,
      y: Math.floor(index / 10),
      territory: "t",
    }));
    let outlined = 0;
    const territory = {
      id: "t",
      name: "T",
      members: nodes.map((node) => node.id),
      centroid: [5, 5] as [number, number],
      get boundary() {
        outlined += 1;
        return undefined;
      },
    };
    const spec = validateSpec({ version: "1", territories: [territory], nodes });
    outlined = 0;
    const steps = buildingScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    // The region's four steps (one plus one per SCENE_POINTS_PER_STEP) come first.
    expect(advance(steps, 4)).toEqual({ done: false });
    expect(outlined).toBe(0);
    advance(steps, 1);
    expect(outlined).toBe(1);
  });

  it("carries a colour per territory and a largest-first paint order", () => {
    const spec = generateCorpus({ seed: 1, size: 500 });
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(new Set(scene.paintOrder)).toEqual(new Set(spec.territories.map((territory) => territory.id)));
    // 30 territories derive groups, so each is a tint of its family's colour (spec slice E §1, §5).
    const direction = tintDirection(DEFAULT_THEME);
    const band = tintBand(DEFAULT_THEME.palette, direction);
    for (const group of scene.groups) {
      const family = scene.groupColours.get(group.id) as string;
      expect(DEFAULT_THEME.palette).toContain(family);
      const tints = TINT_STEPS.map((step) => tint(family, step, direction, band));
      for (const member of group.members) expect(tints).toContain(scene.colours.get(member));
    }
  });

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
    const label = scene.labels.find((candidate) => candidate.id === "solo");
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
    const label = scene.labels.find((candidate) => candidate.id === "pair");
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
    const label = scene.labels.find((candidate) => candidate.id === "ghost");
    expect(label?.anchor).toEqual([7, 9]);
  });

  it("gives every territory one ring and a label on the 5,000-item synthetic corpus, deterministically", () => {
    const spec = generateCorpus({ seed: 1, size: 5000 });
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(scene.shapes.size).toBe(TERRITORY_COUNT);
    for (const territory of spec.territories) {
      expect(scene.shapes.get(territory.id)).toHaveLength(1);
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
    paint(surface, scene, corpus, fit, { regime: "far", pointAlpha: 0, width, height }, DEFAULT_THEME);

    expect(surface.texts.length).toBeGreaterThan(0);
    const boxes = surface.texts.map((drawn) => {
      const measured = estimateText(drawn.text, drawn.font);
      return { x: drawn.x, y: drawn.y, width: measured.width, height: measured.height };
    });
    for (let firstIndex = 0; firstIndex < boxes.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < boxes.length; secondIndex += 1) {
        const first = boxes[firstIndex];
        const second = boxes[secondIndex];
        if (!first || !second) continue;
        const overlapsHorizontally = Math.abs(first.x - second.x) < (first.width + second.width) / 2 + LABEL_PADDING;
        const overlapsVertically = Math.abs(first.y - second.y) < (first.height + second.height) / 2 + LABEL_PADDING;
        expect(overlapsHorizontally && overlapsVertically).toBe(false);
      }
    }
  });
});

describe("buildScene groups", () => {
  const territories = Array.from({ length: 12 }, (_, index) => {
    const column = index % 3;
    return {
      id: `t${index}`,
      name: `Territory ${index}`,
      members: [`n${index}a`, `n${index}b`, `n${index}c`],
      centroid: [column * 100, index] as [number, number],
    };
  });
  const nodes = territories.flatMap((territory) =>
    territory.members.map((id, offset) => ({
      id,
      label: id,
      x: territory.centroid[0] + offset,
      y: territory.centroid[1],
      territory: territory.id,
    })),
  );
  const spec = validateSpec({ version: "1", territories, nodes });
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

  it("carries the derived groups and one placed name per group, measured large and letter-spaced", () => {
    expect(scene.groups).toEqual(deriveTerritoryGroups(spec));
    expect(scene.groupLabels.map((label) => label.id).sort()).toEqual(scene.groups.map((group) => group.id).sort());
    const first = scene.groupLabels[0] as PlacedLabel;
    const plain = estimateText(first.name, DEFAULT_THEME.territoryFonts.large);
    expect(first.width).toBe(plain.width + GROUP_LETTER_SPACING * first.name.length);
  });

  it("places a compact twin of every group name, with the same texts and no wider boxes", () => {
    expect(scene.compactGroupFont).toBe(DEFAULT_COMPACT_GROUP_FONT);
    expect(scene.compactGroupLabels.map((label) => label.name)).toEqual(scene.groupLabels.map((label) => label.name));
    scene.compactGroupLabels.forEach((compact, position) => {
      const wide = scene.groupLabels[position] as PlacedLabel;
      expect(compact.id).toBe(wide.id);
      expect(compact.width).toBeLessThan(wide.width);
      expect(compact.width).toBe(
        estimateText(compact.name, DEFAULT_COMPACT_GROUP_FONT).width + GROUP_LETTER_SPACING * compact.name.length,
      );
    });
  });

  it("reads the compact font from the theme, falling back to the default", () => {
    const font = "700 10px system-ui, sans-serif";
    const themed = buildScene(
      spec,
      DEFAULT_TUNING,
      { ...DEFAULT_THEME, territoryFonts: { ...DEFAULT_THEME.territoryFonts, compact: font } },
      estimateText,
    );
    expect(themed.compactGroupFont).toBe(font);
    const { compact: _dropped, ...withoutCompact } = DEFAULT_THEME.territoryFonts;
    const bare = buildScene(spec, DEFAULT_TUNING, { ...DEFAULT_THEME, territoryFonts: withoutCompact }, estimateText);
    expect(bare.compactGroupFont).toBe(DEFAULT_COMPACT_GROUP_FONT);
  });

  it("picks the compact names below a 600 px box and today's from 600 up", () => {
    expect(NARROW_BOX_WIDTH).toBe(600);
    expect(groupLabelsFor(scene, 599)).toBe(scene.compactGroupLabels);
    expect(groupLabelsFor(scene, 600)).toBe(scene.groupLabels);
  });

  it("anchors a group name inside one of its members", () => {
    for (const label of scene.groupLabels) {
      const group = scene.groups.find((candidate) => candidate.id === label.id) as TerritoryGroup;
      const inside = group.members.some((id) =>
        (scene.shapes.get(id) ?? []).some((ring) => contains(ring, label.anchor)),
      );
      expect(inside).toBe(true);
    }
  });

  it("has a bounding box per territory with rings", () => {
    expect([...scene.bounds.keys()].sort()).toEqual(territories.map((territory) => territory.id).sort());
    expect(scene.bounds.get("t0")?.minX).toBeLessThanOrEqual(0);
  });

  it("has no groups and no group names below 10 territories", () => {
    const small = validateSpec({ version: "1", territories: territories.slice(0, 3), nodes: nodes.slice(0, 9) });
    const smallScene = buildScene(small, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(smallScene.groups).toEqual([]);
    expect(smallScene.groupLabels).toEqual([]);
    expect(smallScene.compactGroupLabels).toEqual([]);
  });

  it("falls back to the largest member's own name anchor when the weighted mean is outside every member", () => {
    const ring = (left: number): Array<[number, number]> => [
      [left, 0],
      [left + 1, 0],
      [left + 1, 1],
      [left, 1],
    ];
    const split = validateSpec({
      version: "1",
      territories: [
        { id: "left", name: "Left", members: ["l"], centroid: [0.5, 0.5], boundary: ring(0), group: "Split" },
        { id: "right", name: "Right", members: ["r"], centroid: [10.5, 0.5], boundary: ring(10), group: "Split" },
      ],
      nodes: [
        { id: "l", label: "l", x: 0.5, y: 0.5, territory: "left" },
        { id: "r", label: "r", x: 10.5, y: 0.5, territory: "right" },
      ],
    });
    const splitScene = buildScene(split, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const leftLabel = splitScene.labels.find((label) => label.id === "left") as PlacedLabel;
    expect(splitScene.groupLabels[0]?.anchor).toEqual(leftLabel.anchor);
  });
});

describe("buildScene: families", () => {
  it("outlines each family over every descendant point and keeps parents out of the leaf maps", () => {
    const spec = nestedSpec();
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect([...scene.shapes.keys()].sort()).toEqual(["a", "b"]);
    expect(scene.paintOrder).not.toContain("p");
    expect(scene.labels.map((label) => label.id)).not.toContain("p");
    expect(scene.bounds.has("p")).toBe(false);
    const rings = scene.groupShapes.get("p") ?? [];
    for (const node of spec.nodes) expect(rings.some((ring) => contains(ring, [node.x, node.y]))).toBe(true);
    expect(scene.groupBounds.get("p")).toBeDefined();
  });

  it("gives a family of one its leaf's own shape", () => {
    const spec = singleChildSpec();
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(scene.groupShapes.get("solo")).toEqual(scene.shapes.get("solo"));
  });

  it("anchors a declared parent's name at the parent's centroid", () => {
    const spec = nestedSpec();
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(scene.groupLabels.find((label) => label.id === "p")?.anchor).toEqual([3, 0.5]);
  });

  it("uses a parent's boundary as its family shape", () => {
    const raw = structuredClone(nestedSpec());
    const parent = raw.territories[0] as MapSpec["territories"][number];
    parent.boundary = [
      [-1, -1],
      [7, -1],
      [7, 2],
      [-1, 2],
    ];
    const scene = buildScene(raw, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(scene.groupShapes.get("p")).toEqual([parent.boundary]);
  });

  it("leaves groupShapes empty for a spec with no groups", () => {
    const spec = validateSpec({
      version: "1",
      territories: [{ id: "t", name: "T", members: ["n"], centroid: [0, 0] }],
      nodes: [{ id: "n", label: "N", x: 0, y: 0, territory: "t" }],
    });
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(scene.groupShapes.size).toBe(0);
    expect(scene.groupBounds.size).toBe(0);
  });

  it.each([
    ["light", DEFAULT_THEME],
    ["dark", DARK_THEME],
  ] as const)("colours a declared family from the palette and its children in tints of it (%s)", (_name, theme) => {
    const scene = buildScene(nestedSpec(), DEFAULT_TUNING, theme, estimateText);
    const family = scene.groupColours.get("p");
    expect(theme.palette).toContain(family);
    const direction = tintDirection(theme);
    const band = tintBand(theme.palette, direction);
    const tints = TINT_STEPS.map((step) => tint(family as string, step, direction, band));
    for (const leaf of ["a", "b"]) expect(tints).toContain(scene.colours.get(leaf));
    expect(scene.colours.has("p")).toBe(false);
  });

  it("keeps one palette colour per territory, and no family colours, without groups", () => {
    const nested = nestedSpec();
    const spec: MapSpec = {
      ...nested,
      territories: nested.territories
        .filter((territory) => territory.id !== "p")
        .map(({ parent: _parent, ...territory }) => territory),
    };
    expect(() => validateSpec(spec)).not.toThrow();
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(scene.groupColours.size).toBe(0);
    for (const territory of spec.territories) expect(DEFAULT_THEME.palette).toContain(scene.colours.get(territory.id));
  });
});

describe("buildScene: edges", () => {
  it("takes the heaviest edge weight of a list too long to spread into Math.max", () => {
    const base = nestedSpec();
    const [first, second] = base.nodes;
    const edges = Array.from({ length: 300_000 }, (_unused, index) => ({
      source: (first as { id: string }).id,
      target: (second as { id: string }).id,
      weight: index === 123_456 ? 0.97 : 0.5,
    }));
    const scene = buildScene({ ...base, edges }, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(scene.maximumEdgeWeight).toBe(0.97);
  });
});

describe("buildScene visitedShare", () => {
  const visit = (spec: MapSpec, ids: readonly string[]): MapSpec => ({
    ...spec,
    nodes: spec.nodes.map((node) => (ids.includes(node.id) ? { ...node, state: "visited" as const } : node)),
  });
  const build = (spec: MapSpec) => buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

  it("is empty when no node is visited", () => {
    expect(build(nestedSpec()).visitedShare.size).toBe(0);
    expect(build(nestedSpec()).groupVisitedShare.size).toBe(0);
  });

  it("holds each leaf's visited nodes over its nodes, and a family's over all its leaves' nodes", () => {
    const scene = build(visit(nestedSpec(), ["a0", "a1", "a2"]));
    expect(scene.visitedShare.get("a")).toBe(0.5);
    expect(scene.visitedShare.has("b")).toBe(false);
    expect(scene.groupVisitedShare.get("p")).toBe(0.25);
    expect(scene.visitedShare.has("p")).toBe(false);
  });

  it("ignores a node that is not marked visited, and a territory with no members has no share", () => {
    const spec = nestedSpec();
    const marked = {
      ...spec,
      nodes: spec.nodes.map((node) => (node.id === "a0" ? { ...node, state: "unvisited" as const } : node)),
    };
    expect(build(marked).visitedShare.size).toBe(0);
    const empty = validateSpec({
      version: "1",
      territories: [{ id: "none", name: "None", members: [], centroid: [0, 0] }],
      nodes: [],
    });
    expect(build(empty).visitedShare.size).toBe(0);
  });
});

describe("buildScene with a territory name style (spec serious default §3)", () => {
  const lengthMeasure = (text: string) => ({ width: text.length * 7, height: 12 });
  const build = (territoryNameStyle?: { uppercase?: boolean; spacing?: number }) =>
    buildScene(nestedSpec(), DEFAULT_TUNING, { ...DEFAULT_THEME, territoryNameStyle }, lengthMeasure);

  it("builds the very same scene for an absent style and for {}", () => {
    expect(build({})).toEqual(build(undefined));
  });

  it("measures the upper-cased text, so the placed box is the drawn box", () => {
    const measured: string[] = [];
    buildScene(nestedSpec(), DEFAULT_TUNING, { ...DEFAULT_THEME, territoryNameStyle: { uppercase: true } }, (text) => {
      measured.push(text);
      return lengthMeasure(text);
    });
    expect(measured.length).toBeGreaterThan(0);
    for (const text of measured) expect(text).toBe(text.toLocaleUpperCase());
  });

  it("adds spacing times the text length to a leaf name and replaces the families' 1 px by it", () => {
    const plain = build(undefined);
    const spaced = build({ spacing: 2 });
    expect(spaced.labels.length).toBeGreaterThan(0);
    for (const label of spaced.labels) {
      const before = plain.labels.find((candidate) => candidate.id === label.id) as PlacedLabel;
      expect(label.width - before.width).toBeCloseTo(2 * label.name.length, 9);
    }
    expect(spaced.groupLabels.length).toBeGreaterThan(0);
    for (const label of spaced.groupLabels) {
      const before = plain.groupLabels.find((candidate) => candidate.id === label.id) as PlacedLabel;
      expect(label.width - before.width).toBeCloseTo((2 - GROUP_LETTER_SPACING) * label.name.length, 9);
    }
  });

  it("keeps the families' 1 px when only uppercase is set", () => {
    const upper = build({ uppercase: true });
    for (const label of upper.groupLabels)
      expect(label.width).toBeCloseTo(
        lengthMeasure(label.name.toLocaleUpperCase()).width + GROUP_LETTER_SPACING * label.name.length,
        9,
      );
  });

  it("throws a RangeError for an invalid spacing", () => {
    expect(() => build({ spacing: -1 })).toThrow(RangeError);
  });
});
