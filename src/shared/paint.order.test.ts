import { describe, expect, it } from "vitest";
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
