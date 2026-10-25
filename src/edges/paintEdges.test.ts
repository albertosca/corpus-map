import { describe, expect, it } from "vitest";
import { estimateText } from "../labels/placement";
import { buildScene } from "../shared/scene";
import { type MapEdge, type MapNode, validateSpec } from "../shared/spec";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import { DEFAULT_TUNING } from "../shared/tuning";
import { clipToBox, NEIGHBOUR_RING_WIDTH, paintEdges } from "./paintEdges";

const identity = { scale: 1, tx: 0, ty: 0 };

function sceneOf(nodes: MapNode[], edges: MapEdge[]) {
  const spec = validateSpec({ version: "1", territories: [], nodes, edges });
  return buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
}

const node = (id: string, horizontal: number, vertical: number): MapNode => ({
  id,
  label: id,
  x: horizontal,
  y: vertical,
  territory: null,
});

function drawn(
  scene: ReturnType<typeof sceneOf>,
  id: string,
  options: Partial<{ cap: number; dimmed: ReadonlySet<string>; width: number; height: number }> = {},
) {
  const surface = new RecordingSurface();
  paintEdges(surface, scene, identity, DEFAULT_THEME, {
    id,
    width: options.width ?? 400,
    height: options.height ?? 400,
    cap: options.cap ?? 3,
    dimmed: options.dimmed ?? new Set(),
    alpha: 0.8,
    restoreAlpha: 1,
  });
  return surface;
}

describe("paintEdges (spec slice E §6)", () => {
  const fan = sceneOf(
    [node("a", 100, 100), node("b", 200, 100), node("c", 100, 200), node("d", 50, 50), node("e", 300, 300)],
    [
      { source: "a", target: "b", weight: 4 },
      { source: "a", target: "c", weight: 3 },
      { source: "a", target: "d", weight: 2 },
      { source: "a", target: "e", weight: 1 },
    ],
  );

  it("draws at most `cap` lines, the heaviest, then neighbour rings", () => {
    const surface = drawn(fan, "a");
    expect(surface.lines).toHaveLength(3);
    expect(surface.lines.map((line) => line.to)).toEqual([
      [200, 100],
      [100, 200],
      [50, 50],
    ]);
    expect(surface.rings.map((ring) => [ring.x, ring.y])).toEqual([
      [200, 100],
      [100, 200],
      [50, 50],
    ]);
    expect(
      surface.rings.every((ring) => ring.width === NEIGHBOUR_RING_WIDTH && ring.color === DEFAULT_THEME.edge),
    ).toBe(true);
    expect(surface.calls).toEqual(["alpha", "line", "line", "line", "ring", "ring", "ring", "alpha"]);
    expect(surface.alphas).toEqual([0.8, 1]);
  });

  it("draws width 1 + 2 × weight / max, and 2 px without weights", () => {
    const weighted = sceneOf(
      [node("a", 10, 10), node("b", 20, 10), node("c", 30, 10)],
      [
        { source: "a", target: "b", weight: 1 },
        { source: "a", target: "c", weight: 0.5 },
      ],
    );
    expect(drawn(weighted, "a").lines.map((line) => line.width)).toEqual([3, 2]);
    const bare = sceneOf([node("a", 10, 10), node("b", 20, 10)], [{ source: "a", target: "b" }]);
    expect(drawn(bare, "a").lines.map((line) => line.width)).toEqual([2]);
  });

  it("draws nothing for cap 0", () => {
    expect(drawn(fan, "a", { cap: 0 }).calls).toEqual([]);
  });

  it("draws nothing for an item without edges or an unknown id", () => {
    expect(drawn(fan, "missing").calls).toEqual([]);
    const lonely = sceneOf([node("a", 10, 10), node("b", 20, 10), node("z", 5, 5)], [{ source: "a", target: "b" }]);
    expect(drawn(lonely, "z").calls).toEqual([]);
  });

  it("skips neighbours in dimmed territories", () => {
    const spec = validateSpec({
      version: "1",
      territories: [{ id: "t", name: "T", members: ["b"], centroid: [200, 100] }],
      nodes: [node("a", 100, 100), { ...node("b", 200, 100), territory: "t" }, node("c", 100, 200)],
      edges: [
        { source: "a", target: "b", weight: 2 },
        { source: "a", target: "c", weight: 1 },
      ],
    });
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    expect(drawn(scene, "a", { dimmed: new Set(["t"]) }).lines.map((line) => line.to)).toEqual([[100, 200]]);
  });

  it("clips a line to an off-screen neighbour at the box edge", () => {
    const scene = sceneOf([node("a", 100, 100), node("b", 500, 100)], [{ source: "a", target: "b" }]);
    expect(drawn(scene, "a", { width: 200, height: 200 }).lines.map((line) => [line.from, line.to])).toEqual([
      [
        [100, 100],
        [200, 100],
      ],
    ]);
  });

  it("clips lines from an off-screen selected item to on-screen neighbours", () => {
    const scene = sceneOf([node("a", -100, 100), node("b", 100, 100)], [{ source: "a", target: "b" }]);
    expect(drawn(scene, "a", { width: 200, height: 200 }).lines.map((line) => [line.from, line.to])).toEqual([
      [
        [0, 100],
        [100, 100],
      ],
    ]);
  });

  it("draws no line, only the ring, when the segment misses the box", () => {
    const scene = sceneOf([node("a", -10, -10), node("b", -5, 300)], [{ source: "a", target: "b" }]);
    const surface = drawn(scene, "a", { width: 200, height: 200 });
    expect(surface.lines).toEqual([]);
    expect(surface.rings).toHaveLength(1);
  });
});

describe("clipToBox", () => {
  it("returns null when the segment misses the box", () => {
    expect(clipToBox([-10, -10], [-5, 300], 200, 200)).toBeNull();
  });

  it("returns a vertical segment outside the box as null and inside it unchanged", () => {
    expect(clipToBox([-1, 10], [-1, 20], 200, 200)).toBeNull();
    expect(clipToBox([10, 10], [10, 20], 200, 200)).toEqual([
      [10, 10],
      [10, 20],
    ]);
  });

  it("clips both ends of a segment crossing the box", () => {
    expect(clipToBox([-100, 50], [300, 50], 200, 200)).toEqual([
      [0, 50],
      [200, 50],
    ]);
  });
});
