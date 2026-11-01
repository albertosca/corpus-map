import { describe, expect, it } from "vitest";
import type { MapSpec } from "../shared/spec";
import { buildRelated, relatedItems } from "./related";

const base: MapSpec = {
  version: "1",
  territories: [],
  nodes: ["a", "b", "c", "d", "e"].map((id, index) => ({ id, label: id, x: index, y: 0, territory: null })),
};

describe("buildRelated (spec slice E §6)", () => {
  it("lists both directions, heaviest first, absent weights last, ties by id", () => {
    const related = buildRelated({
      ...base,
      edges: [
        { source: "a", target: "b", weight: 0.2 },
        { source: "c", target: "a", weight: 0.9, reason: "shared" },
        { source: "a", target: "d" },
        { source: "a", target: "e", weight: 0.2 },
      ],
    });
    expect(related.get("a")?.map((edge) => edge.neighbour)).toEqual(["c", "b", "e", "d"]);
    expect(related.get("c")).toEqual([{ neighbour: "a", weight: 0.9, reason: "shared" }]);
  });

  it("orders two unweighted edges by neighbour id", () => {
    const related = buildRelated({
      ...base,
      edges: [
        { source: "a", target: "e" },
        { source: "a", target: "b" },
      ],
    });
    expect(related.get("a")?.map((edge) => edge.neighbour)).toEqual(["b", "e"]);
  });

  it("is empty without edges", () => {
    expect(buildRelated(base).size).toBe(0);
  });
});

describe("relatedItems (spec slice E §6)", () => {
  it("returns the related nodes in buildRelated's order, with weight and reason", () => {
    const spec = {
      ...base,
      edges: [
        { source: "a", target: "b", weight: 0.2 },
        { source: "c", target: "a", weight: 0.9, reason: "shared" },
      ],
    };
    expect(relatedItems(spec, "a")).toEqual([
      { node: base.nodes[2], weight: 0.9, reason: "shared" },
      { node: base.nodes[1], weight: 0.2, reason: undefined },
    ]);
  });

  it("returns nothing for an unknown id or an item without edges", () => {
    expect(relatedItems(base, "ghost")).toEqual([]);
    expect(relatedItems({ ...base, edges: [{ source: "a", target: "b" }] }, "c")).toEqual([]);
  });

  it("indexes a spec once, so selecting item after item does not walk every edge again (spec mobile §7, INP)", () => {
    let edgeReads = 0;
    let nodeReads = 0;
    const edges = [
      { source: "a", target: "b", weight: 0.5 },
      { source: "c", target: "d" },
    ];
    const spec: MapSpec = {
      ...base,
      get nodes() {
        nodeReads += 1;
        return base.nodes;
      },
      get edges() {
        edgeReads += 1;
        return edges;
      },
    };

    const first = relatedItems(spec, "a");
    const second = relatedItems(spec, "c");

    expect(first.map((item) => item.node.id)).toEqual(["b"]);
    expect(second.map((item) => item.node.id)).toEqual(["d"]);
    expect(edgeReads).toBe(1);
    expect(nodeReads).toBe(1);
  });

  it("reuses the index the scene already built, so the first selection does not walk every edge either (spec mobile §7, INP)", () => {
    let edgeReads = 0;
    const edges = [{ source: "a", target: "b", weight: 0.5 }];
    const spec: MapSpec = {
      ...base,
      get edges() {
        edgeReads += 1;
        return edges;
      },
    };

    const sceneRelated = buildRelated(spec);
    const first = relatedItems(spec, "a");

    expect(first.map((item) => item.node.id)).toEqual(["b"]);
    expect(buildRelated(spec)).toBe(sceneRelated);
    expect(edgeReads).toBe(1);
  });
});
