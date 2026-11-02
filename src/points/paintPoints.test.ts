import { describe, expect, it } from "vitest";
import { estimateText } from "../labels/placement";
import { DIMMED_ALPHA } from "../shared/dimmed";
import { buildScene } from "../shared/scene";
import type { MapSpec } from "../shared/spec";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import { DEFAULT_TUNING } from "../shared/tuning";
import { paintPoints } from "./paintPoints";

const RADIUS = DEFAULT_THEME.pointRadius;
const viewport = { scale: 10, tx: 0, ty: 0 };
const box = { width: 100, height: 80 };

/** A node at screen (`horizontal`, `vertical`) under `viewport`. */
function nodeAt(id: string, horizontal: number, vertical: number, state: "visited" | "unvisited") {
  return { id, label: id, x: horizontal / 10, y: vertical / 10, territory: "t1", state };
}

const spec: MapSpec = {
  version: "1",
  territories: [{ id: "t1", name: "North", members: [], centroid: [5, 4] }],
  nodes: [
    nodeAt("inside", 50, 40, "visited"),
    nodeAt("insideRing", 60, 40, "unvisited"),
    nodeAt("farRight", 400, 40, "visited"),
    nodeAt("farAbove", 50, -300, "unvisited"),
    nodeAt("overhangLeft", -RADIUS + 0.5, 40, "visited"),
    nodeAt("overhangBottom", 50, box.height + RADIUS - 0.5, "unvisited"),
    nodeAt("justPastRight", box.width + RADIUS + 0.5, 40, "visited"),
  ],
};
spec.territories[0]?.members.push(...spec.nodes.map((node) => node.id));

function drawnIds(withBox: boolean): string[] {
  const surface = new RecordingSurface();
  const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
  paintPoints(surface, scene, spec, viewport, DEFAULT_THEME, undefined, 1, withBox ? box : undefined);
  return [...surface.circles.map((circle) => circle.id), ...surface.hollowCircles.map((ring) => ring.id)].sort();
}

describe("paintPoints culling (spec mobile §7: a frame draws what is on screen)", () => {
  it("skips a point whose mark lies wholly outside the box, and keeps one whose mark overhangs an edge", () => {
    expect(drawnIds(true)).toEqual(["inside", "insideRing", "overhangBottom", "overhangLeft"]);
  });

  it("draws every point when no box is given", () => {
    expect(drawnIds(false)).toHaveLength(spec.nodes.length);
  });

  it("draws each pass's points of one kind and colour as one batch (spec mobile §7)", () => {
    const surface = new RecordingSurface();
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    paintPoints(surface, scene, spec, viewport, DEFAULT_THEME);
    expect(surface.pointBatches.map((batch) => [batch.kind, batch.ids.length])).toEqual([
      ["fill", 4],
      ["stroke", 3],
    ]);
  });

  it("keeps a dimmed territory's batch apart from, and under, the rest", () => {
    const twoTerritories: MapSpec = {
      version: "1",
      territories: [
        { id: "t1", name: "North", members: ["inside", "insideRing"], centroid: [5, 4] },
        { id: "t2", name: "South", members: ["other"], centroid: [5, 4] },
      ],
      nodes: [
        nodeAt("inside", 50, 40, "visited"),
        nodeAt("insideRing", 60, 40, "unvisited"),
        { ...nodeAt("other", 70, 40, "visited"), territory: "t2" },
      ],
    };
    const surface = new RecordingSurface();
    const scene = buildScene(twoTerritories, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    paintPoints(surface, scene, twoTerritories, viewport, DEFAULT_THEME, new Set(["t1"]));
    expect(surface.pointBatches.map((batch) => batch.ids)).toEqual([["inside"], ["insideRing"], ["other"]]);
    expect(surface.calls).toEqual(["alpha", "circle", "hollowCircle", "alpha", "circle"]);
  });
});

describe("paintPoints with search matches", () => {
  const searched: MapSpec = {
    version: "1",
    territories: [{ id: "t1", name: "North", members: ["first", "second", "third"], centroid: [5, 4] }],
    nodes: [
      nodeAt("first", 50, 40, "visited"),
      nodeAt("second", 60, 40, "unvisited"),
      nodeAt("third", 70, 40, "visited"),
    ],
  };
  const painted = (matches: ReadonlySet<string> | undefined, dimmed: ReadonlySet<string> = new Set()) => {
    const surface = new RecordingSurface();
    const scene = buildScene(searched, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    paintPoints(surface, scene, searched, viewport, DEFAULT_THEME, dimmed, 1, undefined, matches);
    return surface;
  };

  it("draws the non-matches first at the dimmed alpha, then the matches at the full alpha", () => {
    const surface = painted(new Set(["second"]));
    expect(surface.pointBatches.map((batch) => batch.ids)).toEqual([["first", "third"], ["second"]]);
    expect(surface.alphas).toEqual([DIMMED_ALPHA, 1]);
  });

  it("dims every point for an empty set of matches", () => {
    const surface = painted(new Set());
    expect(surface.pointBatches.flatMap((batch) => batch.ids).sort()).toEqual(["first", "second", "third"]);
    expect(surface.alphas).toEqual([DIMMED_ALPHA, 1]);
  });

  it("draws exactly what an absent set draws when matches is undefined", () => {
    const surface = painted(undefined);
    expect(surface.alphas).toEqual([]);
    expect(surface.pointBatches.map((batch) => batch.ids)).toEqual([["first", "third"], ["second"]]);
  });

  it("keeps a match of a dimmed territory dimmed", () => {
    const surface = painted(new Set(["second"]), new Set(["t1"]));
    expect(surface.pointBatches.flatMap((batch) => batch.ids).sort()).toEqual(["first", "second", "third"]);
    expect(surface.alphas).toEqual([DIMMED_ALPHA, 1]);
  });
});
