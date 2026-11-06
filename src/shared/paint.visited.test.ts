import { describe, expect, it } from "vitest";
import { estimateText } from "../labels/placement";
import { paint } from "./paint";
import { buildScene } from "./scene";
import { type MapSpec, validateSpec } from "./spec";
import { RecordingSurface } from "./surface";
import { DEFAULT_THEME } from "./theme";
import { DEFAULT_TUNING } from "./tuning";

// The visited boost is for where points are not drawn: names reach 4.5:1 over the 0.35 fill, but the palette's
// points reach 3:1 only up to about 0.204 (measured, spec far-visited §5), so the boost fades out as points fade in.

const spec: MapSpec = validateSpec({
  version: "1",
  territories: [
    {
      id: "one",
      name: "One",
      members: ["a", "b"],
      centroid: [1, 1],
      boundary: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
    },
  ],
  nodes: [
    { id: "a", label: "A", x: 1, y: 1, territory: "one", state: "visited" },
    { id: "b", label: "B", x: 2, y: 2, territory: "one", state: "visited" },
  ],
});
const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
const BASE = DEFAULT_THEME.territoryFillAlpha;

function fillAlpha(frame: Record<string, unknown>): number {
  const surface = new RecordingSurface();
  paint(
    surface,
    scene,
    spec,
    { scale: 40, tx: 0, ty: 0 },
    { regime: "far", pointAlpha: 0, width: 400, height: 400, ...frame },
    DEFAULT_THEME,
  );
  return surface.layers[0] as number;
}

describe("paint's visited boost", () => {
  it("is full at far, where no point is drawn", () => {
    expect(fillAlpha({})).toBeCloseTo(BASE * 1.75, 12);
  });

  it("is gone once the points are fully drawn (mid and near)", () => {
    expect(fillAlpha({ regime: "mid", pointAlpha: 1 })).toBeCloseTo(BASE, 12);
    expect(fillAlpha({ regime: "near", pointAlpha: 1 })).toBeCloseTo(BASE, 12);
  });

  it("fades out as the points fade in", () => {
    expect(fillAlpha({ regime: "mid", pointAlpha: 0.5 })).toBeCloseTo(BASE * 1.375, 12);
  });

  it("is gone at far while a search draws the points at full strength", () => {
    expect(fillAlpha({ matches: new Set(["a"]) })).toBeCloseTo(BASE, 12);
  });
});
