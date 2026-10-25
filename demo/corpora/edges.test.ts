import { describe, expect, it } from "vitest";
import type { MapNode } from "../../src/shared/spec";
import { expandEdges, REASON_FALLBACK, sharedTitleTerms, withExpandedEdges } from "./edges";

const nodes: MapNode[] = [
  { id: "p1", label: "Graph neural networks for search", x: 0, y: 0, territory: null },
  { id: "p2", label: "Search with graph transformers", x: 1, y: 1, territory: null },
  { id: "p3", label: "Quantum error correction", x: 2, y: 2, territory: null },
];

describe("expandEdges", () => {
  it("expands index triples into edges with weights in [0, 1] and title-term reasons", () => {
    expect(
      expandEdges(nodes, [
        [0, 1, 87],
        [0, 2, 81],
      ]),
    ).toEqual([
      { source: "p1", target: "p2", weight: 0.87, reason: "graph, search" },
      { source: "p1", target: "p3", weight: 0.81, reason: REASON_FALLBACK },
    ]);
  });

  it("drops stop words and short words", () => {
    expect(sharedTitleTerms("On the use of LLMs in the wild", "The use of LLMs")).toEqual(["llms"]);
  });

  it("keeps at most three shared terms, in the first title's order", () => {
    expect(sharedTitleTerms("alpha beta gamma delta", "delta gamma beta alpha")).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("withExpandedEdges", () => {
  it("expands a body whose edges are compact triples", () => {
    const body = { version: "1", territories: [], nodes, edges: [[1, 2, 90]] };
    expect(withExpandedEdges(body)).toEqual({
      ...body,
      edges: [{ source: "p2", target: "p3", weight: 0.9, reason: REASON_FALLBACK }],
    });
  });

  it("leaves a body without compact edges untouched", () => {
    const expanded = { nodes, edges: [{ source: "p1", target: "p2" }] };
    expect(withExpandedEdges(expanded)).toBe(expanded);
    const bare = { nodes };
    expect(withExpandedEdges(bare)).toBe(bare);
    expect(withExpandedEdges(null)).toBeNull();
    expect(withExpandedEdges({ nodes, edges: [] })).toEqual({ nodes, edges: [] });
  });

  it("leaves an index outside the nodes for validateSpec to reject", () => {
    const body = { nodes, edges: [[0, 9, 90]] };
    expect(withExpandedEdges(body)).toBe(body);
  });

  it("leaves a node without a string label or id for validateSpec to reject, instead of throwing", () => {
    for (const broken of [{ ...nodes[0], label: 5 }, { ...nodes[0], id: 5 }, null]) {
      const body = { nodes: [broken, nodes[1]], edges: [[0, 1, 90]] };
      expect(withExpandedEdges(body)).toBe(body);
    }
  });
});
