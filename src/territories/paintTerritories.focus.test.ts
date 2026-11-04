import { describe, expect, it } from "vitest";
import { DIMMED_ALPHA } from "../shared/dimmed";
import type { Scene } from "../shared/scene";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import { GROUP_OUTLINE_WIDTH, paintTerritories, TERRITORY_OUTLINE_WIDTH } from "./paintTerritories";
import type { Ring } from "./shape";

const IDENTITY = { scale: 1, tx: 0, ty: 0 };
const FILL_ALPHA = 0.2;

const triangle = (offset: number): Ring => [
  [offset, 0],
  [offset + 4, 0],
  [offset, 4],
];

// Only the fields paintTerritories reads: families A (a1, a2) and B (b1, b2), plus a leaf "loose" in no family.
const scene = {
  paintOrder: ["a1", "a2", "b1", "b2", "loose"],
  shapes: new Map([
    ["a1", [triangle(0)]],
    ["a2", [triangle(5)]],
    ["b1", [triangle(20)]],
    ["b2", [triangle(25)]],
    ["loose", [triangle(40)]],
  ]),
  colours: new Map([
    ["a1", "#a10000"],
    ["a2", "#a20000"],
    ["b1", "#0000b1"],
    ["b2", "#0000b2"],
    ["loose", "#999999"],
  ]),
  groupShapes: new Map([
    ["A", [triangle(0), triangle(5)]],
    ["B", [triangle(20), triangle(25)]],
  ]),
  groupColours: new Map([
    ["A", "#00ca00"],
    ["B", "#00cb00"],
  ]),
  groups: [
    { id: "A", members: ["a1", "a2"] },
    { id: "B", members: ["b1", "b2"] },
  ],
} as unknown as Scene;

function paint(familyAlpha: number, focus?: ReadonlyMap<string, number>, dimmed: ReadonlySet<string> = new Set()) {
  const surface = new RecordingSurface();
  paintTerritories(surface, scene, IDENTITY, DEFAULT_THEME, FILL_ALPHA, dimmed, familyAlpha, focus);
  return surface;
}

const fills = (surface: RecordingSurface) => surface.polygons.map((polygon) => polygon.fill);
const leafOutlineColours = (surface: RecordingSurface) =>
  surface.outlines.filter((outline) => outline.width === TERRITORY_OUTLINE_WIDTH).map((outline) => outline.color);
const familyOutlineColours = (surface: RecordingSurface) =>
  surface.outlines.filter((outline) => outline.width === GROUP_OUTLINE_WIDTH).map((outline) => outline.color);

describe("paintTerritories with a family focus (spec family focus §4)", () => {
  it.each([0, 0.5, 1])(
    "draws exactly what it draws without a focus when every weight is 1 (familyAlpha %s)",
    (alpha) => {
      const plain = paint(alpha);
      const focused = paint(
        alpha,
        new Map([
          ["A", 1],
          ["B", 1],
        ]),
      );
      expect(focused.calls).toEqual(plain.calls);
      expect(focused.layers).toEqual(plain.layers);
      expect(focused.alphas).toEqual(plain.alphas);
      expect(focused.outlines).toEqual(plain.outlines);
    },
  );

  it("draws a weight-0 family at the family level only: two layers, no leaf outline for it", () => {
    const surface = paint(
      0,
      new Map([
        ["A", 1],
        ["B", 0],
      ]),
    );
    expect(surface.layers).toEqual([FILL_ALPHA, FILL_ALPHA]);
    // The leaves layer holds A's leaves and the loose one; the family layer holds only B's region.
    expect(fills(surface)).toEqual(["#a10000", "#a20000", "#999999", "#00cb00", "#00cb00"]);
    expect(leafOutlineColours(surface)).toEqual(["#a10000", "#a20000", "#999999"]);
    expect(familyOutlineColours(surface)).toEqual(["#00ca00", "#00cb00"]);
  });

  it("gives a family caught mid-transition its own layers at its own levels", () => {
    const surface = paint(
      0,
      new Map([
        ["A", 1],
        ["B", 0.5],
      ]),
    );
    expect(surface.layers).toHaveLength(3);
    expect(surface.layers[0]).toBeCloseTo(FILL_ALPHA);
    expect(surface.layers[1]).toBeCloseTo(FILL_ALPHA * 0.5);
    expect(surface.layers[2]).toBeCloseTo((FILL_ALPHA * 0.5) / (1 - FILL_ALPHA * 0.5));
    const halfOutline = surface.outlines.filter((outline) => outline.width === TERRITORY_OUTLINE_WIDTH);
    expect(halfOutline.map((outline) => outline.color)).toEqual([
      "#a10000",
      "#a20000",
      "#999999",
      "#0000b1",
      "#0000b2",
    ]);
    expect(surface.alphas).toContain(0.5);
  });

  it("ignores the focus at the far regime, where the families are the whole picture", () => {
    const plain = paint(1);
    const focused = paint(
      1,
      new Map([
        ["A", 1],
        ["B", 0],
      ]),
    );
    expect(focused.calls).toEqual(plain.calls);
    expect(focused.layers).toEqual(plain.layers);
    expect(focused.outlines).toEqual(plain.outlines);
  });

  it("draws a leaf in no family at weight 1, whatever the focus says", () => {
    const surface = paint(
      0,
      new Map([
        ["A", 0],
        ["B", 0],
      ]),
    );
    expect(fills(surface)).toContain("#999999");
    expect(leafOutlineColours(surface)).toEqual(["#999999"]);
  });

  it("keeps a dimmed leaf's alpha inside the layer, composed with the level", () => {
    const surface = paint(
      0,
      new Map([
        ["A", 1],
        ["B", 0.5],
      ]),
      new Set(["b1"]),
    );
    const halfLayer = surface.layers.findIndex((alpha) => Math.abs(alpha - FILL_ALPHA * 0.5) < 1e-9);
    expect(halfLayer).toBeGreaterThanOrEqual(0);
    expect(surface.alphas).toContain(DIMMED_ALPHA);
  });
});

describe("paintTerritories keeps the fill as opaque as at rest through a transition (review M-6)", () => {
  // Layers composite one over the other, so where a leaf and its family overlap the opacity is 1 - (1 - leaf) * (1 - family).
  // The loose leaf (in no family) has a layer of its own at FILL_ALPHA, which is not part of A's or B's pixel.
  const composite = (surface: RecordingSurface) =>
    1 - surface.layers.filter((alpha) => alpha !== FILL_ALPHA).reduce((rest, alpha) => rest * (1 - alpha), 1);

  it("composites a leaf and its family to FILL_ALPHA at every group alpha, not below it", () => {
    for (const familyAlpha of [0.1, 0.25, 0.5, 0.75, 0.9])
      expect(
        composite(
          paint(
            familyAlpha,
            new Map([
              ["A", 1],
              ["B", 1],
            ]),
          ),
        ),
      ).toBeCloseTo(FILL_ALPHA, 10);
  });

  it("does the same for a family the focus has taken part-way down", () => {
    for (const weight of [0.2, 0.5, 0.8])
      expect(
        composite(
          paint(
            0,
            new Map([
              ["A", weight],
              ["B", weight],
            ]),
          ),
        ),
      ).toBeCloseTo(FILL_ALPHA, 10);
  });

  it("is unchanged at rest: leaves alone at 0, families alone at 1", () => {
    expect(paint(0).layers).toEqual([FILL_ALPHA]);
    expect(paint(1).layers).toEqual([FILL_ALPHA]);
  });
});
