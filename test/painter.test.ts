import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, paint } from "../src/canvas/painter";
import { RecordingSurface } from "../src/canvas/surface";
import type { MapSpec } from "../src/spec";

const spec: MapSpec = {
  version: "1",
  territories: [{ id: "t1", name: "North", members: ["a", "b", "c"], centroid: [1, 1] }],
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, territory: "t1", state: "visited" },
    { id: "b", label: "B", x: 2, y: 0, territory: "t1", state: "unvisited" },
    { id: "c", label: "C", x: 1, y: 2, territory: "t1" },
    { id: "loose", label: "Loose", x: 9, y: 9, territory: null },
  ],
};

const vp = { scale: 10, tx: 0, ty: 0 };

describe("paint", () => {
  it("draws territory boundary and name at the far regime, and no points", () => {
    const s = new RecordingSurface();
    paint(s, spec, vp, "far", DEFAULT_THEME);
    expect(s.polygons).toHaveLength(1);
    expect(s.texts.map((t) => t.text)).toContain("North");
    expect(s.circles).toHaveLength(0);
  });

  it("draws boundaries and every point at the mid regime", () => {
    const s = new RecordingSurface();
    paint(s, spec, vp, "mid", DEFAULT_THEME);
    expect(s.polygons).toHaveLength(1);
    expect(s.circles).toHaveLength(4);
  });

  it("draws an un-territoried node without stretching any boundary toward it", () => {
    const s = new RecordingSurface();
    paint(s, spec, vp, "mid", DEFAULT_THEME);
    const ring = s.polygons[0].points;
    expect(ring.every(([x]) => x < 90)).toBe(true);
  });

  it("renders a spec where every node is un-territoried", () => {
    const only = { version: "1", territories: [], nodes: [spec.nodes[3]] } as MapSpec;
    const s = new RecordingSurface();
    paint(s, only, vp, "mid", DEFAULT_THEME);
    expect(s.polygons).toHaveLength(0);
    expect(s.circles).toHaveLength(1);
  });

  it("distinguishes visited from unvisited by fill", () => {
    const s = new RecordingSurface();
    paint(s, spec, vp, "mid", DEFAULT_THEME);
    const a = s.circles.find((c) => c.id === "a");
    const b = s.circles.find((c) => c.id === "b");
    expect(a?.fill).not.toBe(b?.fill);
  });

  it("treats a node with no state as unvisited", () => {
    const s = new RecordingSurface();
    paint(s, spec, vp, "mid", DEFAULT_THEME);
    const b = s.circles.find((c) => c.id === "b");
    const c = s.circles.find((c) => c.id === "c");
    expect(c?.fill).toBe(b?.fill);
  });

  it("places points through the viewport transform", () => {
    const s = new RecordingSurface();
    paint(s, spec, vp, "mid", DEFAULT_THEME);
    expect(s.circles.find((c) => c.id === "b")).toMatchObject({ x: 20, y: 0 });
  });

  it("clears before drawing", () => {
    const s = new RecordingSurface();
    paint(s, spec, vp, "far", DEFAULT_THEME);
    expect(s.cleared).toBe(1);
  });
});
