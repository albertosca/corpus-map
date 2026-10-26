import { describe, expect, it } from "vitest";
import { validateSpec } from "../../src/shared/spec";
import { ARXIV_ABS_URL_PREFIX, withArxivMeta, withDerivedMembers, withExpandedArxiv, yearOfArxivId } from "./compact";

describe("yearOfArxivId", () => {
  it.each([
    ["2609.26779", 2026],
    ["0704.0001", 2007],
    ["1501.00001", 2015],
    ["cs/0112017", 2001],
    ["math/9901001", 1999],
    ["hep-th/9108001", 1991],
    ["math.GT/0309136", 2003],
  ])("reads %s as %s", (id, year) => {
    expect(yearOfArxivId(id)).toBe(year);
  });

  it.each(["", "garbage", "2609.267", "26090.12345", "cs/011201", "2609.26779v2"])(
    "has no year for %j, which is not an arXiv id",
    (id) => {
      expect(yearOfArxivId(id)).toBeUndefined();
    },
  );
});

const slim = {
  version: "1",
  territories: [
    { id: "cs.AI", name: "Artificial Intelligence", centroid: [0, 0] },
    { id: "cs.CL", name: "Computation and Language", centroid: [1, 1] },
  ],
  nodes: [
    { id: "2609.00002", label: "B", x: 1, y: 1, territory: "cs.CL" },
    { id: "2609.00001", label: "A", x: 0, y: 0, territory: "cs.AI" },
    { id: "2609.00003", label: "C", x: 1, y: 0, territory: "cs.CL" },
  ],
};

describe("withDerivedMembers", () => {
  it("lists each territory's nodes in node order when it ships without members", () => {
    const expanded = withDerivedMembers(slim) as { territories: Array<{ members: string[] }> };
    expect(expanded.territories.map((territory) => territory.members)).toEqual([
      ["2609.00001"],
      ["2609.00002", "2609.00003"],
    ]);
  });

  it("keeps a members list the body already carries", () => {
    const members = ["2609.00001"];
    const body = { ...slim, territories: [{ ...slim.territories[0], members }, slim.territories[1]] };
    const expanded = withDerivedMembers(body) as { territories: Array<{ members: string[] }> };
    expect(expanded.territories[0]?.members).toBe(members);
  });

  it("gives a territory no node claims an empty list, so validateSpec reports it", () => {
    const body = { ...slim, territories: [...slim.territories, { id: "cs.GL", name: "General", centroid: [2, 2] }] };
    const expanded = withDerivedMembers(body) as { territories: Array<{ members: string[] }> };
    expect(expanded.territories[2]?.members).toEqual([]);
  });

  it.each([null, "text", { nodes: [] }, { territories: [] }])("returns %j as it was", (body) => {
    expect(withDerivedMembers(body)).toBe(body);
  });
});

describe("withArxivMeta", () => {
  it("gives every node its year and abstract-page url from its id", () => {
    const expanded = withArxivMeta(slim) as { nodes: Array<{ meta: unknown }> };
    expect(expanded.nodes[0]?.meta).toEqual({ year: 2026, url: `${ARXIV_ABS_URL_PREFIX}2609.00002` });
  });

  it("keeps a meta the node already carries, and adds none to an id that is not arXiv's", () => {
    const body = {
      ...slim,
      nodes: [
        { ...slim.nodes[0], meta: { year: 1999 } },
        { ...slim.nodes[1], id: "local-1" },
      ],
    };
    const expanded = withArxivMeta(body) as { nodes: Array<{ meta?: unknown }> };
    expect(expanded.nodes[0]?.meta).toEqual({ year: 1999 });
    expect(expanded.nodes[1]).not.toHaveProperty("meta");
  });

  it.each([null, 7, { territories: [] }])("returns %j as it was", (body) => {
    expect(withArxivMeta(body)).toBe(body);
  });
});

describe("withExpandedArxiv", () => {
  it("turns the slim payload into a spec validateSpec accepts, compact edges included", () => {
    const spec = validateSpec(withExpandedArxiv({ ...slim, edges: [[1, 2, 40]] }));
    expect(spec.territories.map((territory) => territory.members.length)).toEqual([1, 2]);
    expect(spec.nodes.map((node) => node.meta)).toEqual(
      ["2609.00002", "2609.00001", "2609.00003"].map((id) => ({ year: 2026, url: `${ARXIV_ABS_URL_PREFIX}${id}` })),
    );
    expect(spec.edges).toEqual([
      { source: "2609.00001", target: "2609.00003", weight: 0.4, reason: "similar abstract" },
    ]);
  });
});
