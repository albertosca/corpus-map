import { describe, expect, it } from "vitest";
import { generateCorpus } from "../../fixtures/synthetic/generate";
import { estimateText } from "../labels/placement";
import { DEFAULT_THRESHOLDS, type Regime } from "../lod/lod";
import { UNVISITED_RING_WIDTH } from "../points/paintPoints";
import { TERRITORY_OUTLINE_WIDTH } from "../territories/paintTerritories";
import { fitSpec, worldBounds } from "../viewport/fit";
import { type Frame, paint } from "./paint";
import { DENSE_FILL_FACTOR, DENSE_NAME_ALPHA } from "./presentation";
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

const viewport = { scale: 10, tx: 0, ty: 0 };
/** Larger than any name these tests paint, so none is skipped for its size. */
const BOX = { width: 4000, height: 4000 };
/**
 * `viewport` shifted in from the canvas's top-left corner, so the names of `spec`
 * (anchored near world (1, 1), screen (10, 10) under `viewport`) sit well inside
 * the canvas and the tests that expect a name do not lean on edge clipping.
 */
const LABEL_VP = { scale: 10, tx: 200, ty: 200 };

function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error("expected at least one item");
  return item;
}

function frameFor(regime: Regime, extra?: Partial<Frame>): Frame {
  return { regime, pointAlpha: 1, width: BOX.width, height: BOX.height, ...extra };
}

function paintSpec(
  mapSpec: MapSpec,
  surface: RecordingSurface,
  regime: Regime,
  extra?: Partial<Frame>,
  currentViewport: typeof viewport = viewport,
): void {
  const scene = buildScene(mapSpec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  paint(surface, scene, mapSpec, currentViewport, frameFor(regime, extra), DEFAULT_THEME);
}

/** Every point mark painted: visited discs and unvisited rings. */
function pointMarks(surface: RecordingSurface): number {
  return surface.circles.length + surface.hollowCircles.length;
}

/** `spec` painted at `regime` under `viewport`. */
function paintAt(regime: Regime): RecordingSurface {
  const surface = new RecordingSurface();
  paintSpec(spec, surface, regime);
  return surface;
}

/** A spec holding only `spec`'s un-territoried node, painted at `regime`. */
function paintLooseNodeAt(regime: Regime): RecordingSurface {
  const only = { version: "1", territories: [], nodes: [spec.nodes[3]] } as MapSpec;
  const surface = new RecordingSurface();
  paintSpec(only, surface, regime);
  return surface;
}

describe("paint", () => {
  it("draws territory boundary and name at the far regime, and no points", () => {
    const surface = new RecordingSurface();
    paintSpec(spec, surface, "far", undefined, LABEL_VP);
    expect(surface.polygons).toHaveLength(1);
    expect(surface.texts.map((recordedText) => recordedText.text)).toContain("North");
    expect(pointMarks(surface)).toBe(0);
  });

  it("draws boundaries and every point at the mid regime", () => {
    const surface = new RecordingSurface();
    paintSpec(spec, surface, "mid");
    expect(surface.polygons).toHaveLength(1);
    expect(pointMarks(surface)).toBe(4);
  });

  it("draws an un-territoried node without stretching any boundary toward it", () => {
    const surface = new RecordingSurface();
    paintSpec(spec, surface, "mid");
    const ring = first(surface.polygons).points;
    expect(ring.every(([horizontal]) => horizontal < 90)).toBe(true);
  });

  it("renders a spec where every node is un-territoried", () => {
    const surface = paintLooseNodeAt("mid");
    expect(surface.polygons).toHaveLength(0);
    expect(pointMarks(surface)).toBe(1);
  });

  it("draws a visited point as a filled disc and an unvisited one as a ring, both in the territory's colour", () => {
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const surface = paintAt("mid");
    const visited = surface.circles.find((circle) => circle.id === "a");
    const unvisited = surface.hollowCircles.find((circle) => circle.id === "b");
    expect(visited?.fill).toBe(scene.colours.get("t1"));
    expect(visited?.r).toBe(DEFAULT_THEME.pointRadius);
    expect(unvisited?.colour).toBe(scene.colours.get("t1"));
    expect(unvisited?.width).toBe(UNVISITED_RING_WIDTH);
    expect((unvisited?.r ?? 0) + UNVISITED_RING_WIDTH / 2).toBe(DEFAULT_THEME.pointRadius);
  });

  it("treats a node with no state as unvisited", () => {
    expect(paintAt("mid").hollowCircles.some((circle) => circle.id === "c")).toBe(true);
  });

  it("paints a point with no territory in pointNeutral", () => {
    const surface = paintLooseNodeAt("mid");
    const marks = [
      ...surface.circles.map((circle) => circle.fill),
      ...surface.hollowCircles.map((circle) => circle.colour),
    ];
    expect(marks).toEqual([DEFAULT_THEME.pointNeutral]);
  });

  it("places points through the viewport transform", () => {
    expect(paintAt("mid").hollowCircles.find((circle) => circle.id === "b")).toMatchObject({ x: 20, y: 0 });
  });

  it("clears before drawing", () => {
    const surface = new RecordingSurface();
    paintSpec(spec, surface, "far");
    expect(surface.cleared).toBe(1);
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
    const surface = new RecordingSurface();
    paintSpec(specWithBoundary, surface, "mid");
    const ring = first(surface.polygons).points;
    expect(ring).toEqual([
      [0, 0],
      [30, 0],
      [0, 30],
    ]);
    // Slice D: the boundary is a fill polygon inside the layer, in the
    // territory's colour (the only territory takes the palette's first),
    // plus an outline of the same ring in the same colour.
    const territoryColour = DEFAULT_THEME.palette[0];
    expect(first(surface.polygons)).toMatchObject({ fill: territoryColour, stroke: "transparent" });
    expect(first(surface.outlines)).toEqual({ points: ring, color: territoryColour, width: TERRITORY_OUTLINE_WIDTH });
  });

  it("paints points at the frame's pointAlpha, and the alpha is reset to 1 afterwards", () => {
    const surface = new RecordingSurface();
    paintSpec(spec, surface, "mid", { pointAlpha: 0.4 });
    expect(surface.alphas[0]).toBe(0.4);
    expect(surface.alphas[surface.alphas.length - 1]).toBe(1);
    expect(pointMarks(surface)).toBe(4);
  });

  it("paints no points when pointAlpha is 0", () => {
    const surface = new RecordingSurface();
    paintSpec(spec, surface, "mid", { pointAlpha: 0 });
    expect(pointMarks(surface)).toBe(0);
    expect(surface.alphas).toHaveLength(0);
  });

  it("does not draw a name whose activeFromScale exceeds the current viewport scale", () => {
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
    const scene = buildScene(two, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const small = scene.labels.find((label) => label.id === "small");
    if (!small) throw new Error("expected a placed label for 'small'");
    expect(small.activeFromScale).toBeGreaterThan(0);

    const below = new RecordingSurface();
    paint(
      below,
      scene,
      two,
      { ...LABEL_VP, scale: small.activeFromScale / 2 },
      { regime: "mid", pointAlpha: 1, ...BOX },
      DEFAULT_THEME,
    );
    expect(below.texts.map((recordedText) => recordedText.text)).not.toContain("Small Territory");

    const above = new RecordingSurface();
    paint(
      above,
      scene,
      two,
      { ...LABEL_VP, scale: small.activeFromScale },
      { regime: "mid", pointAlpha: 1, ...BOX },
      DEFAULT_THEME,
    );
    expect(above.texts.map((recordedText) => recordedText.text)).toContain("Small Territory");
  });
});

describe("paint order", () => {
  it("paints every boundary, then a faded point pass, then every name", () => {
    const two: MapSpec = {
      version: "1",
      territories: [
        { id: "t1", name: "North", members: ["a", "b", "c"], centroid: [1, 1] },
        // Far enough from t1 (dy = 100) that its name's activeFromScale
        // stays well below the module `viewport`'s scale of 10, so both names
        // are visible for this order check.
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
    const surface = new RecordingSurface();
    paintSpec(two, surface, "mid", undefined, LABEL_VP);
    expect(surface.calls).toEqual([
      "clear",
      "layer",
      "polygon",
      "polygon",
      "layerEnd",
      "outline",
      "outline",
      "alpha",
      // None of these nodes is visited, so every point is a ring.
      ...Array(6).fill("hollowCircle"),
      "alpha",
      "text",
      "text",
    ]);
  });

  it("paints boundaries then names, and no points, at the far regime", () => {
    const surface = new RecordingSurface();
    paintSpec(spec, surface, "far", undefined, LABEL_VP);
    expect(surface.calls).toEqual(["clear", "layer", "polygon", "layerEnd", "outline", "text"]);
  });
});

describe("names at the canvas edge", () => {
  // `paintLabels` skips a name only when its box is larger than the canvas;
  // where the name sits never enters the decision. Each case sizes or
  // places the canvas half a pixel either side of the box of "North" (the
  // only name `spec` places), measured from its anchor.
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  const north = scene.labels.find((label) => label.name === "North");
  if (!north) throw new Error("expected a placed label for North");
  const halfWidth = north.width / 2;
  const halfHeight = north.height / 2;
  // Screen position of the anchor under LABEL_VP.
  const anchorHorizontal = north.anchor[0] * LABEL_VP.scale + LABEL_VP.tx;
  const anchorVertical = north.anchor[1] * LABEL_VP.scale + LABEL_VP.ty;
  const drawn = (currentViewport: typeof viewport, width: number, height: number): string[] => {
    const surface = new RecordingSurface();
    paint(surface, scene, spec, currentViewport, { regime: "far", pointAlpha: 0, width, height }, DEFAULT_THEME);
    return surface.texts.map((recordedText) => recordedText.text);
  };

  // A view that puts the anchor at the centre of a `width` x `height` canvas.
  const centred = (width: number, height: number) => ({
    ...LABEL_VP,
    tx: LABEL_VP.tx + width / 2 - anchorHorizontal,
    ty: LABEL_VP.ty + height / 2 - anchorVertical,
  });

  it("skips a name wider or taller than the canvas, even centred in it", () => {
    expect(drawn(centred(north.width - 0.5, 4000), north.width - 0.5, 4000)).toEqual([]);
    expect(drawn(centred(4000, north.height - 0.5), 4000, north.height - 0.5)).toEqual([]);
  });

  it("draws a name exactly as wide and as tall as the canvas", () => {
    expect(drawn(centred(north.width, north.height), north.width, north.height)).toEqual(["North"]);
  });

  it("draws a name that fits the canvas but crosses its edge, left for the canvas to clip", () => {
    // Box half a pixel past the left, top, right and bottom edges in turn.
    expect(drawn({ ...LABEL_VP, tx: LABEL_VP.tx - (anchorHorizontal - halfWidth) - 0.5 }, 4000, 4000)).toEqual([
      "North",
    ]);
    expect(drawn({ ...LABEL_VP, ty: LABEL_VP.ty - (anchorVertical - halfHeight) - 0.5 }, 4000, 4000)).toEqual([
      "North",
    ]);
    expect(drawn(LABEL_VP, anchorHorizontal + halfWidth - 0.5, 4000)).toEqual(["North"]);
    expect(drawn(LABEL_VP, 4000, anchorVertical + halfHeight - 0.5)).toEqual(["North"]);
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
    const bounds = worldBounds(corpus);
    const centreHorizontal = (bounds.minX + bounds.maxX) / 2;
    const centreVertical = (bounds.minY + bounds.maxY) / 2;
    const vp2 = { scale, tx: width / 2 - centreHorizontal * scale, ty: height / 2 - centreVertical * scale };
    const screenPoints = corpus.nodes
      .map((node) => [node.x * vp2.scale + vp2.tx, node.y * vp2.scale + vp2.ty] as [number, number])
      .filter(
        ([horizontal, vertical]) => horizontal >= 0 && horizontal <= width && vertical >= 0 && vertical <= height,
      );

    const threshold = 2 * DEFAULT_THEME.pointRadius;
    let overlapping = 0;
    for (let index = 0; index < screenPoints.length; index += 1) {
      const [horizontalAt, verticalAt] = screenPoints[index] as [number, number];
      for (let otherIndex = 0; otherIndex < screenPoints.length; otherIndex += 1) {
        if (index === otherIndex) continue;
        const [otherHorizontal, otherVertical] = screenPoints[otherIndex] as [number, number];
        if (Math.hypot(horizontalAt - otherHorizontal, verticalAt - otherVertical) < threshold) {
          overlapping += 1;
          break;
        }
      }
    }
    const share = screenPoints.length === 0 ? 0 : overlapping / screenPoints.length;
    expect(share).toBeLessThanOrEqual(MEASURED + 0.02);
  });
});

describe("keyboard focus on the canvas (2026-09-25 review, B10)", () => {
  // Two territories far enough apart that each has its own rings.
  const two: MapSpec = {
    version: "1",
    territories: [
      { id: "t1", name: "North", members: ["a", "b", "c"], centroid: [1, 1] },
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
  const scene = buildScene(two, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  const screenRings = (id: string) =>
    (scene.shapes.get(id) ?? []).map((ring) =>
      ring.map(([horizontal, vertical]) => [
        horizontal * LABEL_VP.scale + LABEL_VP.tx,
        vertical * LABEL_VP.scale + LABEL_VP.ty,
      ]),
    );
  const paintWith = (regime: Regime, extra: Partial<Frame>): RecordingSurface => {
    const surface = new RecordingSurface();
    paint(surface, scene, two, LABEL_VP, frameFor(regime, extra), DEFAULT_THEME);
    return surface;
  };
  // Since slice D every territory is outlined in its own colour; the focus
  // outline is the one stroked in the theme's focus colour.
  const focusOutlines = (surface: RecordingSurface) =>
    surface.outlines.filter((outline) => outline.color === DEFAULT_THEME.focusOutline);

  it("outlines every ring of the focused territory, and only that one, in the theme's focus style", () => {
    const surface = paintWith("far", { focusedTerritory: "t2" });
    expect(screenRings("t2").length).toBeGreaterThan(0);
    expect(focusOutlines(surface).map((outline) => outline.points)).toEqual(screenRings("t2"));
    for (const outline of focusOutlines(surface)) {
      expect(outline.color).toBe(DEFAULT_THEME.focusOutline);
      expect(outline.width).toBe(DEFAULT_THEME.focusOutlineWidth);
    }
  });

  it("draws no outline without a focused territory, or for an id the scene does not have", () => {
    expect(focusOutlines(paintWith("far", {}))).toEqual([]);
    expect(focusOutlines(paintWith("far", { focusedTerritory: null }))).toEqual([]);
    expect(focusOutlines(paintWith("far", { focusedTerritory: "nope" }))).toEqual([]);
  });

  it("draws the outline above boundaries and points, below names", () => {
    const surface = paintWith("mid", { focusedTerritory: "t1" });
    // The n-th "outline" call records the n-th entry of `outlines`.
    const outlineCalls = surface.calls.flatMap((call, index) => (call === "outline" ? [index] : []));
    const firstFocus = surface.outlines.findIndex((outline) => outline.color === DEFAULT_THEME.focusOutline);
    expect(firstFocus).toBeGreaterThanOrEqual(0);
    const firstOutline = outlineCalls[firstFocus] ?? -1;
    expect(firstOutline).toBeGreaterThan(surface.calls.lastIndexOf("polygon"));
    expect(firstOutline).toBeGreaterThan(surface.calls.lastIndexOf("alpha"));
    expect(firstOutline).toBeLessThan(surface.calls.indexOf("text"));
  });

  it("rings the focused item's point, at full opacity, in the focus style", () => {
    const surface = paintWith("near", { focusedNode: "e", pointAlpha: 0.3 });
    expect(surface.rings).toHaveLength(1);
    const ring = first(surface.rings);
    expect(ring).toMatchObject({
      x: 2 * LABEL_VP.scale + LABEL_VP.tx,
      y: 100 * LABEL_VP.scale + LABEL_VP.ty,
      color: DEFAULT_THEME.focusOutline,
      width: DEFAULT_THEME.focusOutlineWidth,
    });
    expect(ring.r).toBeGreaterThan(DEFAULT_THEME.pointRadius);
    // After the faded point pass has reset the alpha to 1.
    expect(surface.calls.indexOf("ring")).toBeGreaterThan(surface.calls.lastIndexOf("alpha"));
    expect(paintWith("near", { focusedNode: "missing" }).rings).toEqual([]);
  });
});

describe("presentation (slice D)", () => {
  /**
   * Two territories far apart, so both names are active under `LABEL_VP`:
   * "Big" (three members, ranked large) and "Tiny" (one member, ranked small).
   * `spec` has a single territory, which ranks small, so it cannot show the
   * large/muted split.
   */
  const presentationSpec: MapSpec = {
    version: "1",
    territories: [
      { id: "big", name: "Big", members: ["a", "b", "c"], centroid: [1, 1] },
      { id: "tiny", name: "Tiny", members: ["d"], centroid: [60, 60] },
    ],
    nodes: [
      { id: "a", label: "A", x: 0, y: 0, territory: "big" },
      { id: "b", label: "B", x: 2, y: 0, territory: "big" },
      { id: "c", label: "C", x: 1, y: 2, territory: "big" },
      { id: "d", label: "D", x: 60, y: 60, territory: "tiny" },
    ],
  };

  function paintFrame(extra: Partial<Frame>): RecordingSurface {
    const surface = new RecordingSurface();
    paintSpec(presentationSpec, surface, "far", extra, LABEL_VP);
    return surface;
  }

  it("composites the fill layer at half alpha in dense", () => {
    expect(paintFrame({ presentation: "guided" }).layers).toEqual([DEFAULT_THEME.territoryFillAlpha]);
    expect(paintFrame({ presentation: "dense" }).layers).toEqual([
      DEFAULT_THEME.territoryFillAlpha * DENSE_FILL_FACTOR,
    ]);
  });

  it("draws large names at full emphasis and mutes medium and small names in dense", () => {
    const surface = paintFrame({ presentation: "dense" });
    expect(surface.texts.map((text) => text.text).sort()).toEqual(["Big", "Tiny"]);
    const firstName = surface.calls.indexOf("text");
    const names = surface.calls.slice(firstName);
    expect(names.filter((call) => call === "alpha")).toHaveLength(2);
    expect(surface.alphas.slice(-2)).toEqual([DENSE_NAME_ALPHA, 1]);
    expect(names).toEqual(["text", "alpha", "text", "alpha"]);
    expect(surface.texts.map((text) => text.text)).toEqual(["Big", "Tiny"]);
  });

  it("does not touch the alpha around names in guided, or when no muted name is drawn", () => {
    const guided = paintFrame({ presentation: "guided" });
    expect(guided.calls.slice(guided.calls.indexOf("text")).includes("alpha")).toBe(false);
    // "Tiny" (its member and so its anchor) right beside "Big" stays inactive at this scale, so
    // dense draws only the large name and never sets the alpha around names.
    const crowded: MapSpec = {
      ...presentationSpec,
      territories: presentationSpec.territories.map((territory) =>
        territory.id === "tiny" ? { ...territory, centroid: [1.2, 1] } : territory,
      ),
      nodes: presentationSpec.nodes.map((node) => (node.id === "d" ? { ...node, x: 1.2, y: 1 } : node)),
    };
    const onlyLarge = new RecordingSurface();
    paintSpec(crowded, onlyLarge, "far", { presentation: "dense" }, LABEL_VP);
    expect(onlyLarge.texts.map((text) => text.text)).toEqual(["Big"]);
    expect(onlyLarge.calls.slice(onlyLarge.calls.indexOf("text")).includes("alpha")).toBe(false);
  });
});
