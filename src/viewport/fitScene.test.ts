import { describe, expect, it } from "vitest";
import type { PlacedLabel } from "../labels/placement";
import type { MapSpec } from "../shared/spec";
import type { Ring } from "../territories/shape";
import { fitBounds, sceneBounds } from "./fit";
import { fitScene } from "./fitScene";
import { toScreen } from "./viewport";

const spec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, territory: null },
    { id: "b", label: "B", x: 10, y: 10, territory: null },
  ],
} as MapSpec;
const label = (anchor: [number, number], width: number, activeFromScale = 0): PlacedLabel => ({
  id: "t",
  name: "Name",
  anchor,
  labelClass: "large",
  width,
  height: 20,
  activeFromScale,
});

describe("fitScene", () => {
  it("frames rings that reach past the nodes", () => {
    const shapes = new Map<string, Ring[]>([
      [
        "t",
        [
          [
            [-10, -10],
            [20, -10],
            [20, 20],
            [-10, 20],
          ],
        ],
      ],
    ]);
    const viewport = fitScene(spec, { shapes, labels: [] }, 400, 300, 24);
    expect(viewport).toEqual(fitBounds(sceneBounds(spec, shapes), 400, 300, 24));
  });

  it("keeps a name anchored near the edge whole inside the box", () => {
    const placed = label([0, 5], 160);
    const viewport = fitScene(spec, { shapes: new Map(), labels: [placed] }, 400, 300, 24);
    const [horizontal] = toScreen(viewport, placed.anchor[0], placed.anchor[1]);
    expect(horizontal - placed.width / 2).toBeGreaterThanOrEqual(0);
  });

  it("ignores a name wider than the box and a name not yet active", () => {
    const plain = fitScene(spec, { shapes: new Map(), labels: [] }, 400, 300, 24);
    expect(fitScene(spec, { shapes: new Map(), labels: [label([0, 5], 500)] }, 400, 300, 24)).toEqual(plain);
    expect(fitScene(spec, { shapes: new Map(), labels: [label([0, 5], 160, 1e9)] }, 400, 300, 24)).toEqual(plain);
  });

  it("frames boundary rings when there are no nodes, and the unit box for an empty spec", () => {
    const empty = { version: "1", territories: [], nodes: [] } as MapSpec;
    const shapes = new Map<string, Ring[]>([
      [
        "t",
        [
          [
            [0, 0],
            [8, 0],
            [8, 4],
          ],
        ],
      ],
    ]);
    expect(fitScene(empty, { shapes, labels: [] }, 400, 300, 24)).toEqual(
      fitBounds({ minX: 0, minY: 0, maxX: 8, maxY: 4 }, 400, 300, 24),
    );
    expect(fitScene(empty, { shapes: new Map(), labels: [] }, 400, 300, 24)).toEqual(
      fitBounds({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 400, 300, 24),
    );
  });
});
