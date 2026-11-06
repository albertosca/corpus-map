import { describe, expect, it } from "vitest";
import type { Scene } from "../shared/scene";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import { GROUP_OUTLINE_WIDTH, paintTerritories, TERRITORY_OUTLINE_WIDTH } from "./paintTerritories";
import type { Ring } from "./shape";

const IDENTITY = { scale: 1, tx: 0, ty: 0 };

const triangle = (offset: number): Ring => [
  [offset, 0],
  [offset + 4, 0],
  [offset, 4],
];

// Only the fields paintTerritories reads: two leaves in one family.
const scene = {
  paintOrder: ["a", "b"],
  shapes: new Map([
    ["a", [triangle(0)]],
    ["b", [triangle(10)]],
  ]),
  colours: new Map([
    ["a", "#aa0000"],
    ["b", "#0000bb"],
  ]),
  groupShapes: new Map([["family", [triangle(0), triangle(10)]]]),
  groupColours: new Map([["family", "#00cc00"]]),
  visitedShare: new Map(),
  groupVisitedShare: new Map(),
  groups: [{ id: "family", members: ["a", "b"] }],
} as unknown as Scene;

describe("paintTerritories outlines during the family cross-fade", () => {
  it.each([0.25, 0.5, 0.75])(
    "strokes the leaves at 1 - familyAlpha and the family at full alpha (%s)",
    (familyAlpha) => {
      const surface = new RecordingSurface();
      paintTerritories(surface, scene, IDENTITY, DEFAULT_THEME, 0.2, new Set(), familyAlpha);
      const afterLayers = surface.calls.slice(surface.calls.lastIndexOf("layerEnd") + 1);
      expect(afterLayers).toEqual(["alpha", "outline", "outline", "alpha", "outline"]);
      expect(surface.alphas.slice(-2)).toEqual([1 - familyAlpha, 1]);
      expect(surface.outlines.map((outline) => [outline.color, outline.width])).toEqual([
        ["#aa0000", TERRITORY_OUTLINE_WIDTH],
        ["#0000bb", TERRITORY_OUTLINE_WIDTH],
        ["#00cc00", GROUP_OUTLINE_WIDTH],
      ]);
    },
  );
});
