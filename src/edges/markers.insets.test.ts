import { describe, expect, it } from "vitest";
import { estimateText } from "../labels/placement";
import { NO_DIMMED } from "../shared/dimmed";
import { buildScene } from "../shared/scene";
import { type MapEdge, type MapNode, validateSpec } from "../shared/spec";
import { DEFAULT_THEME } from "../shared/theme";
import { DEFAULT_TUNING } from "../shared/tuning";
import { edgeMarkers, MARKER_FONT, MARKER_HEIGHT } from "./markers";

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

const box = { width: 400, height: 300, cap: 3, dimmed: NO_DIMMED, id: "s" };
// Marker width for a one-word label: its text plus 16 px of padding.
const widthOf = (label: string) => estimateText(label, MARKER_FONT).width + 16;

describe("edgeMarkers with insets (an overlay covering part of the box)", () => {
  it("counts a neighbour under a right inset as off screen and pins its marker to the inset's edge", () => {
    const scene = sceneOf(
      [node("s", 100, 100), node("hidden", 350, 100)],
      [{ source: "s", target: "hidden", weight: 1 }],
    );
    expect(edgeMarkers(scene, identity, box)).toEqual([]);
    const markers = edgeMarkers(scene, identity, { ...box, insets: { top: 0, right: 100, bottom: 0, left: 0 } });
    expect(markers).toEqual([
      {
        id: "hidden",
        label: "hidden",
        left: 300 - widthOf("hidden"),
        top: 100 - MARKER_HEIGHT / 2,
        width: widthOf("hidden"),
        height: MARKER_HEIGHT,
      },
    ]);
  });

  it("keeps a top marker below a top inset", () => {
    const scene = sceneOf([node("s", 100, 150), node("up", 100, -500)], [{ source: "s", target: "up", weight: 1 }]);
    const [marker] = edgeMarkers(scene, identity, { ...box, insets: { top: 60, right: 0, bottom: 0, left: 0 } });
    expect(marker?.top).toBe(60);
  });

  it("draws nothing when the insets leave no usable area", () => {
    const scene = sceneOf([node("s", 100, 100), node("far", 900, 100)], [{ source: "s", target: "far", weight: 1 }]);
    expect(edgeMarkers(scene, identity, { ...box, insets: { top: 0, right: 200, bottom: 0, left: 200 } })).toEqual([]);
  });
});
