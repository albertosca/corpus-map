import { describe, expect, it } from "vitest";
import { DIMMED_ALPHA } from "../shared/dimmed";
import type { Scene } from "../shared/scene";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import { paintTerritories, TERRITORY_OUTLINE_WIDTH } from "./paintTerritories";
import type { Ring } from "./shape";

const IDENTITY = { scale: 1, tx: 0, ty: 0 };

const triangle = (offset: number): Ring => [
  [offset, 0],
  [offset + 4, 0],
  [offset, 4],
];

// Only the fields paintTerritories reads; a spec without groups.
function sceneOf(territories: Array<{ id: string; colour: string; rings: Ring[] }>): Scene {
  return {
    paintOrder: territories.map((territory) => territory.id),
    shapes: new Map(territories.map((territory) => [territory.id, territory.rings])),
    colours: new Map(territories.map((territory) => [territory.id, territory.colour])),
    groupShapes: new Map(),
    groupColours: new Map(),
    visitedShare: new Map(),
    groupVisitedShare: new Map(),
    groups: [],
  } as unknown as Scene;
}

const paintOutlines = (scene: Scene, dimmed: ReadonlySet<string> = new Set()) => {
  const surface = new RecordingSurface();
  paintTerritories(surface, scene, IDENTITY, DEFAULT_THEME, 0.2, dimmed);
  return surface;
};

describe("paintTerritories outlines (one stroke per colour and alpha)", () => {
  const scene = sceneOf([
    { id: "a", colour: "#aa0000", rings: [triangle(0), triangle(10)] },
    { id: "b", colour: "#0000bb", rings: [triangle(20)] },
    { id: "c", colour: "#aa0000", rings: [triangle(30)] },
  ]);

  it("strokes every ring of one colour in one call, colours in the order they first appear", () => {
    expect(paintOutlines(scene).outlines).toEqual([
      { rings: [triangle(0), triangle(10), triangle(30)], color: "#aa0000", width: TERRITORY_OUTLINE_WIDTH },
      { rings: [triangle(20)], color: "#0000bb", width: TERRITORY_OUTLINE_WIDTH },
    ]);
  });

  it("keeps a dimmed territory's rings in their own stroke at DIMMED_ALPHA, and restores the alpha", () => {
    const surface = paintOutlines(scene, new Set(["a"]));
    expect(surface.outlines.map((outline) => [outline.color, outline.rings.length])).toEqual([
      ["#aa0000", 2],
      ["#0000bb", 1],
      ["#aa0000", 1],
    ]);
    const afterLayer = surface.calls.slice(surface.calls.indexOf("layerEnd"));
    expect(afterLayer).toEqual(["layerEnd", "alpha", "outline", "alpha", "outline", "outline"]);
    expect(surface.alphas.slice(-2)).toEqual([DIMMED_ALPHA, 1]);
  });

  it("strokes nothing for a territory whose rings are all too short to outline", () => {
    const degenerate = sceneOf([
      {
        id: "line",
        colour: "#aa0000",
        rings: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      },
    ]);
    expect(paintOutlines(degenerate).outlines).toEqual([]);
  });
});
