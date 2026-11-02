import { describe, expect, it } from "vitest";
import type { PlacedItemLabel } from "../labels/itemLabels";
import { estimateText } from "../labels/placement";
import { paint } from "./paint";
import { buildScene } from "./scene";
import { validateSpec } from "./spec";
import { RecordingSurface } from "./surface";
import { DEFAULT_THEME } from "./theme";
import { DEFAULT_TUNING } from "./tuning";

const square = (left: number, size: number): Array<[number, number]> => [
  [left, left],
  [left + size, left],
  [left + size, left + size],
  [left, left + size],
];

// The small territory is listed first, so painting in spec order would put it under the large one.
const spec = validateSpec({
  version: "1",
  territories: [
    { id: "small", name: "Small", members: ["a"], centroid: [5, 5], boundary: square(4, 2) },
    { id: "large", name: "Large", members: ["b", "c"], centroid: [5, 5], boundary: square(0, 10) },
  ],
  nodes: [
    { id: "a", label: "A", x: 5, y: 5, territory: "small", state: "visited" },
    { id: "b", label: "B", x: 1, y: 1, territory: "large" },
    { id: "c", label: "C", x: 9, y: 9, territory: "large", state: "visited" },
  ],
});
const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

function painted(): RecordingSurface {
  const surface = new RecordingSurface();
  const viewport = { scale: 40, tx: 0, ty: 0 };
  const frame = {
    regime: "mid" as const,
    pointAlpha: 1,
    width: 400,
    height: 400,
    focusedTerritory: "large",
    focusedNode: "b",
  };
  paint(surface, scene, spec, viewport, frame, DEFAULT_THEME);
  return surface;
}

describe("paint order (slice D)", () => {
  it("paints the fill layer, then outlines, then points, then focus, then names", () => {
    const calls = painted().calls;
    const layerEnd = calls.indexOf("layerEnd");
    const pointsStart = calls.indexOf("alpha");
    const pointsEnd = calls.lastIndexOf("alpha");
    const firstName = calls.indexOf("text");
    expect(calls.slice(0, 2)).toEqual(["clear", "layer"]);
    expect(calls.slice(2, layerEnd)).toEqual(["polygon", "polygon"]);
    expect(calls.slice(layerEnd + 1, pointsStart)).toEqual(["outline", "outline"]);
    expect(calls.slice(pointsStart + 1, pointsEnd).length).toBe(3);
    expect(calls.slice(pointsEnd + 1, firstName)).toEqual(["outline", "ring"]);
    expect(calls.slice(firstName).every((call) => call === "text")).toBe(true);
  });

  it("fills the largest territory first, so the smaller one stays visible on top", () => {
    const surface = painted();
    expect(surface.polygons.map((polygon) => polygon.fill)).toEqual([
      scene.colours.get("large"),
      scene.colours.get("small"),
    ]);
    expect(surface.polygons.every((polygon) => polygon.stroke === "transparent")).toBe(true);
    expect(surface.layers).toEqual([DEFAULT_THEME.territoryFillAlpha]);
  });

  it("outlines each territory in its own colour at the outline width", () => {
    const territoryOutlines = painted().outlines.slice(0, 2);
    expect(territoryOutlines.map((outline) => outline.color)).toEqual([
      scene.colours.get("large"),
      scene.colours.get("small"),
    ]);
    expect(territoryOutlines.every((outline) => outline.width === 1.5)).toBe(true);
  });

  it("paints the selection ring last inside the point layer, under the focus and the names", () => {
    const surface = new RecordingSurface();
    paint(
      surface,
      scene,
      spec,
      { scale: 40, tx: 0, ty: 0 },
      { regime: "mid", pointAlpha: 0.5, width: 400, height: 400, selected: "b" },
      DEFAULT_THEME,
    );
    const pointsStart = surface.calls.indexOf("alpha");
    const pointsEnd = surface.calls.lastIndexOf("alpha");
    expect(surface.calls.slice(pointsStart + 1, pointsEnd).length).toBe(4);
    expect(surface.calls[pointsEnd - 1]).toBe("ring");
    expect(surface.alphas).toEqual([0.5, 1]);
  });

  it("paints no selection ring at far", () => {
    const surface = new RecordingSurface();
    paint(
      surface,
      scene,
      spec,
      { scale: 40, tx: 0, ty: 0 },
      { regime: "far", pointAlpha: 0, width: 400, height: 400, selected: "b" },
      DEFAULT_THEME,
    );
    expect(surface.rings).toEqual([]);
  });
});

describe("edges in the point layer (spec slice E §6)", () => {
  const withEdges = validateSpec({
    ...spec,
    edges: [
      { source: "b", target: "c", weight: 1 },
      { source: "b", target: "a", weight: 0.5 },
      { source: "a", target: "c" },
    ],
  });
  const edgeScene = buildScene(withEdges, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  const layer = (frame: { selected?: string; hovered?: string; edgesPerNode?: number }) => {
    const surface = new RecordingSurface();
    paint(
      surface,
      edgeScene,
      withEdges,
      { scale: 40, tx: 0, ty: 0 },
      { regime: "mid", pointAlpha: 0.5, width: 400, height: 400, ...frame },
      DEFAULT_THEME,
    );
    const start = surface.calls.indexOf("alpha");
    const end = surface.calls.lastIndexOf("alpha");
    return { surface, calls: surface.calls.slice(start, end + 1) };
  };

  it("draws the selected item's lines, then its neighbours' rings, then the selection ring", () => {
    const { surface, calls } = layer({ selected: "b", edgesPerNode: 3 });
    expect(calls).toEqual([
      "alpha",
      "circle",
      "hollowCircle",
      "circle",
      "alpha",
      "line",
      "line",
      "ring",
      "ring",
      "alpha",
      "ring",
      "alpha",
    ]);
    expect(surface.alphas).toEqual([0.5, 0.5, 0.5, 1]);
  });

  it("previews a hovered item's edges at half the point alpha, under the selected item's", () => {
    const { surface } = layer({ selected: "b", hovered: "a", edgesPerNode: 3 });
    expect(surface.alphas).toEqual([0.5, 0.25, 0.5, 0.5, 0.5, 1]);
    expect(surface.lines).toHaveLength(4);
  });

  it("draws no edges without edgesPerNode, or for a hovered item that is the selected one", () => {
    expect(layer({ selected: "b" }).surface.lines).toEqual([]);
    expect(layer({ selected: "b", hovered: "b", edgesPerNode: 3 }).surface.lines).toHaveLength(2);
  });
});

describe("a spec without groups", () => {
  it("paints exactly the calls it painted before families existed (spec slice E §4)", () => {
    const surface = new RecordingSurface();
    paint(
      surface,
      scene,
      spec,
      { scale: 40, tx: 0, ty: 0 },
      { regime: "far", pointAlpha: 0, width: 400, height: 400, groupAlpha: 1 },
      DEFAULT_THEME,
    );
    expect({
      calls: surface.calls,
      layers: surface.layers,
      outlines: surface.outlines.length,
      alphas: surface.alphas,
    }).toMatchInlineSnapshot(`
      {
        "alphas": [],
        "calls": [
          "clear",
          "layer",
          "polygon",
          "polygon",
          "layerEnd",
          "outline",
          "outline",
          "text",
        ],
        "layers": [
          0.2,
        ],
        "outlines": 2,
      }
    `);
  });
});

describe("item labels in the point layer (spec item labels §7)", () => {
  const withEdges = validateSpec({ ...spec, edges: [{ source: "b", target: "c", weight: 1 }] });
  const edgeScene = buildScene(withEdges, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  const label: PlacedItemLabel = {
    id: "c",
    territory: "large",
    anchor: [9, 9],
    lines: ["C"],
    width: 20,
    height: 16,
    offset: [0, -14],
    activeFromScale: 0,
  };
  const painted = (regime: "mid" | "near", itemLabelAlpha: number) => {
    const surface = new RecordingSurface();
    paint(
      surface,
      edgeScene,
      withEdges,
      { scale: 40, tx: 0, ty: 0 },
      {
        regime,
        pointAlpha: 1,
        width: 400,
        height: 400,
        selected: "b",
        edgesPerNode: 3,
        itemLabels: [label],
        itemLabelAlpha,
      },
      DEFAULT_THEME,
    );
    return surface;
  };

  it("paints plates after the points and before the selected item's edges and ring, names last", () => {
    const surface = painted("near", 0.5);
    const calls = surface.calls;
    const plate = calls.indexOf("plate");
    expect(plate).toBeGreaterThan(calls.lastIndexOf("circle"));
    expect(plate).toBeLessThan(calls.indexOf("line"));
    expect(plate).toBeLessThan(calls.indexOf("ring"));
    const itemText = surface.texts.findIndex((text) => text.text === "C");
    expect(itemText).toBe(0);
    expect(calls.lastIndexOf("text")).toBeGreaterThan(calls.lastIndexOf("ring"));
    expect(surface.alphas.slice(0, 3)).toEqual([1, 0.5, 1]);
  });

  it("paints no plate at mid, or at near with the labels faded out", () => {
    expect(painted("mid", 1).plates).toEqual([]);
    expect(painted("near", 0).plates).toEqual([]);
  });
});

describe("search matches in the point layer (spec search §2)", () => {
  const frame = { regime: "mid" as const, pointAlpha: 1, width: 400, height: 400 };
  const run = (extra: object) => {
    const surface = new RecordingSurface();
    paint(surface, scene, spec, { scale: 40, tx: 0, ty: 0 }, { ...frame, ...extra }, DEFAULT_THEME);
    return surface;
  };

  it("issues exactly the same calls with matches undefined as without the field", () => {
    expect(run({ matches: undefined }).calls).toEqual(run({}).calls);
  });

  it("rings the matches after the points and before the selection ring", () => {
    const surface = run({ matches: new Set(["b"]), selected: "c" });
    expect(surface.rings.map((ring) => ring.width)).toEqual([1.5, 2]);
    const calls = surface.calls;
    expect(calls.indexOf("ring")).toBeGreaterThan(calls.lastIndexOf("circle"));
  });

  it("paints no match ring at far", () => {
    expect(run({ matches: new Set(["b"]), regime: "far" }).rings).toEqual([]);
  });
});
