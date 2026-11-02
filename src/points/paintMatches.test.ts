import { describe, expect, it } from "vitest";
import { estimateText } from "../labels/placement";
import { buildScene } from "../shared/scene";
import type { MapSpec } from "../shared/spec";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import { DEFAULT_TUNING } from "../shared/tuning";
import { MATCH_RING_GAP, MATCH_RING_WIDTH, paintMatches } from "./paintMatches";

const viewport = { scale: 10, tx: 0, ty: 0 };
const box = { width: 100, height: 80 };
const spec: MapSpec = {
  version: "1",
  territories: [{ id: "t1", name: "North", members: ["inside", "other", "farRight"], centroid: [5, 4] }],
  nodes: [
    { id: "inside", label: "inside", x: 5, y: 4, territory: "t1" },
    { id: "other", label: "other", x: 6, y: 4, territory: "t1" },
    { id: "farRight", label: "farRight", x: 400, y: 4, territory: "t1" },
  ],
};
const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

function ringsFor(matches: ReadonlySet<string>): RecordingSurface {
  const surface = new RecordingSurface();
  paintMatches(surface, scene, viewport, DEFAULT_THEME, matches, box);
  return surface;
}

describe("paintMatches", () => {
  it("rings each matched item that is on screen, outside the point, in the selection colour", () => {
    const surface = ringsFor(new Set(["inside"]));
    expect(surface.hollowCircles).toEqual([
      {
        id: "inside",
        x: 50,
        y: 40,
        r: DEFAULT_THEME.pointRadius + MATCH_RING_GAP,
        colour: DEFAULT_THEME.selectionRing ?? DEFAULT_THEME.territoryLabel,
        width: MATCH_RING_WIDTH,
      },
    ]);
  });

  it("skips an id the spec does not have, and an item wholly outside the box", () => {
    expect(ringsFor(new Set(["ghost", "farRight"])).hollowCircles).toEqual([]);
  });

  it("draws nothing for an empty set", () => {
    expect(ringsFor(new Set()).calls).toEqual([]);
  });

  it("rings every matched item once, all in one batched stroke", () => {
    const surface = ringsFor(new Set(["inside", "other"]));
    expect(surface.hollowCircles.map((ring) => ring.x)).toEqual([50, 60]);
    expect(surface.pointBatches.filter((batch) => batch.kind === "stroke")).toHaveLength(1);
  });

  it("skips an item whose territory is dimmed, keeping the others", () => {
    const surface = new RecordingSurface();
    paintMatches(surface, scene, viewport, DEFAULT_THEME, new Set(["inside"]), box, new Set(["t1"]));
    expect(surface.calls).toEqual([]);
  });
});
