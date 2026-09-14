import { describe, expect, it } from "vitest";
import { visibleNodes } from "../src/react/visible";
import type { MapSpec } from "../src/spec";

const viewport = { scale: 10, tx: 0, ty: 0 };

describe("visibleNodes", () => {
  it("filters out nodes whose screen position falls outside the viewport", () => {
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: [
        { id: "onscreen", label: "On", x: 1, y: 1, territory: null },
        { id: "offscreen", label: "Off", x: 100, y: 0, territory: null },
      ],
    };
    const result = visibleNodes(spec, viewport, 400, 300, 200);
    expect(result.map((n) => n.id)).toEqual(["onscreen"]);
  });

  it("caps the result even when every node is on screen", () => {
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: Array.from({ length: 5000 }, (_, i) => ({
        id: `n${i}`,
        label: `N${i}`,
        x: i * 0.001,
        y: 0,
        territory: null,
      })),
    };
    const result = visibleNodes(spec, viewport, 400, 300, 50);
    expect(result).toHaveLength(50);
  });
});
