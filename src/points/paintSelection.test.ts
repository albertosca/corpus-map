import { describe, expect, it } from "vitest";
import { estimateText } from "../labels/placement";
import { buildScene } from "../shared/scene";
import { validateSpec } from "../shared/spec";
import { RecordingSurface } from "../shared/surface";
import { DEFAULT_THEME } from "../shared/theme";
import { DEFAULT_TUNING } from "../shared/tuning";
import { paintSelection, SELECTION_RING_GAP, SELECTION_RING_WIDTH } from "./paintSelection";

const spec = validateSpec({
  version: "1",
  territories: [{ id: "t", name: "T", members: ["a"], centroid: [1, 1] }],
  nodes: [{ id: "a", label: "A", x: 1, y: 1, territory: "t" }],
});
const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);

describe("paintSelection", () => {
  it("draws one ring outside the keyboard focus ring, a gap clear of the point", () => {
    const surface = new RecordingSurface();
    paintSelection(surface, scene, { scale: 10, tx: 5, ty: 5 }, DEFAULT_THEME, "a");
    const focusOuterEdge = DEFAULT_THEME.pointRadius + DEFAULT_THEME.focusOutlineWidth * 1.5;
    expect(surface.rings).toEqual([
      {
        x: 15,
        y: 15,
        r: DEFAULT_THEME.pointRadius + DEFAULT_THEME.focusOutlineWidth + SELECTION_RING_GAP + SELECTION_RING_WIDTH / 2,
        color: DEFAULT_THEME.selectionRing,
        width: SELECTION_RING_WIDTH,
      },
    ]);
    expect((surface.rings[0]?.r ?? 0) - SELECTION_RING_WIDTH / 2).toBeGreaterThan(focusOuterEdge);
  });

  it("uses the theme's selectionRing when it has one", () => {
    const surface = new RecordingSurface();
    paintSelection(surface, scene, { scale: 1, tx: 0, ty: 0 }, { ...DEFAULT_THEME, selectionRing: "#ff00ff" }, "a");
    expect(surface.rings[0]?.color).toBe("#ff00ff");
  });

  it("draws nothing for an unknown id", () => {
    const surface = new RecordingSurface();
    paintSelection(surface, scene, { scale: 1, tx: 0, ty: 0 }, DEFAULT_THEME, "missing");
    expect(surface.rings).toEqual([]);
  });
});
