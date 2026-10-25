import { describe, expect, it } from "vitest";
import { estimateText } from "../labels/placement";
import { NO_DIMMED } from "../shared/dimmed";
import { buildScene } from "../shared/scene";
import { type MapEdge, type MapNode, validateSpec } from "../shared/spec";
import { DEFAULT_THEME } from "../shared/theme";
import { DEFAULT_TUNING } from "../shared/tuning";
import { type EdgeMarker, edgeMarkers, MARKER_FONT, MARKER_HEIGHT, MARKER_MAXIMUM_WIDTH, markerAt } from "./markers";

const identity = { scale: 1, tx: 0, ty: 0 };
const node = (id: string, horizontal: number, vertical: number): MapNode => ({
  id,
  label: id,
  x: horizontal,
  y: vertical,
  territory: null,
});

function sceneOf(nodes: MapNode[], edges: MapEdge[]) {
  return buildScene(
    validateSpec({ version: "1", territories: [], nodes, edges }),
    DEFAULT_TUNING,
    DEFAULT_THEME,
    estimateText,
  );
}

const box = { width: 400, height: 300, cap: 3, dimmed: NO_DIMMED };
const intersects = (first: EdgeMarker, second: EdgeMarker) =>
  first.left < second.left + second.width &&
  second.left < first.left + first.width &&
  first.top < second.top + second.height &&
  second.top < first.top + first.height;

describe("edgeMarkers (spec slice E §6)", () => {
  it("makes one marker per off-screen drawn neighbour, on the edge the line leaves through", () => {
    const scene = sceneOf(
      [node("s", 100, 100), node("right", 900, 100), node("top", 100, -500), node("near", 200, 200)],
      [
        { source: "s", target: "right", weight: 3 },
        { source: "s", target: "top", weight: 2 },
        { source: "s", target: "near", weight: 1 },
      ],
    );
    const markers = edgeMarkers(scene, identity, { ...box, id: "s" });
    expect(markers.map((marker) => marker.id).sort()).toEqual(["right", "top"]);
    const right = markers.find((marker) => marker.id === "right") as EdgeMarker;
    expect(right.left + right.width).toBe(400);
    expect(right.top).toBe(100 - MARKER_HEIGHT / 2);
    expect(right.width).toBe(Math.min(MARKER_MAXIMUM_WIDTH, estimateText("right", MARKER_FONT).width + 16));
    const top = markers.find((marker) => marker.id === "top") as EdgeMarker;
    expect(top.top).toBe(0);
    expect(top.left).toBe(100 - top.width / 2);
  });

  it("stacks markers that would overlap on one edge", () => {
    const scene = sceneOf(
      [node("s", 100, 150), node("first", 900, 150), node("second", 900, 155), node("third", 900, 160)],
      [
        { source: "s", target: "first" },
        { source: "s", target: "second" },
        { source: "s", target: "third" },
      ],
    );
    const markers = edgeMarkers(scene, identity, { ...box, id: "s" });
    expect(markers).toHaveLength(3);
    for (const [index, first] of markers.entries())
      for (const second of markers.slice(index + 1)) expect(intersects(first, second)).toBe(false);
  });

  it("stacks back from the end of an edge when the markers run past it", () => {
    const scene = sceneOf(
      [node("s", 100, 290), node("first", 900, 295), node("second", 900, 296), node("third", 900, 297)],
      [
        { source: "s", target: "first" },
        { source: "s", target: "second" },
        { source: "s", target: "third" },
      ],
    );
    const markers = edgeMarkers(scene, identity, { ...box, id: "s" });
    for (const marker of markers) expect(marker.top + marker.height).toBeLessThanOrEqual(300);
  });

  it("puts a marker on the left and the bottom edge too", () => {
    const scene = sceneOf(
      [node("s", 100, 100), node("west", -900, 100), node("south", 100, 900)],
      [
        { source: "s", target: "west" },
        { source: "s", target: "south" },
      ],
    );
    const markers = edgeMarkers(scene, identity, { ...box, id: "s" });
    expect(markers.find((marker) => marker.id === "west")?.left).toBe(0);
    expect(markers.find((marker) => marker.id === "south")?.top).toBe(300 - MARKER_HEIGHT);
  });

  it("makes no marker for a neighbour on screen, for cap 0, or for an unknown item", () => {
    const scene = sceneOf([node("s", 100, 100), node("near", 200, 200)], [{ source: "s", target: "near" }]);
    expect(edgeMarkers(scene, identity, { ...box, id: "s" })).toEqual([]);
    const far = sceneOf([node("s", 100, 100), node("right", 900, 100)], [{ source: "s", target: "right" }]);
    expect(edgeMarkers(far, identity, { ...box, id: "s", cap: 0 })).toEqual([]);
    expect(edgeMarkers(far, identity, { ...box, id: "ghost" })).toEqual([]);
  });

  it("makes no marker when the line misses the box (both ends off screen)", () => {
    const scene = sceneOf([node("s", -100, -100), node("other", -200, 900)], [{ source: "s", target: "other" }]);
    expect(edgeMarkers(scene, identity, { ...box, id: "s" })).toEqual([]);
  });
});

describe("markerAt", () => {
  it("resolves a press inside a marker box, and null outside every box", () => {
    const markers = [{ id: "x", label: "X", left: 10, top: 10, width: 50, height: 22 }];
    expect(markerAt(markers, 30, 20)).toBe("x");
    expect(markerAt(markers, 70, 20)).toBeNull();
  });
});
