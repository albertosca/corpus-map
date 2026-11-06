import { describe, expect, it } from "vitest";
import type { MapEdge, MapNode, MapSpec } from "../shared/spec";
import { labelOf, orderAnswer, orderLocal } from "./rank";

const node = (id: string, label: string): MapNode => ({ id, label, x: 0, y: 0, territory: null });
const specOf = (nodes: MapNode[], edges?: MapEdge[]): MapSpec => ({
  version: "1",
  territories: [],
  nodes,
  ...(edges === undefined ? {} : { edges }),
});

const spec = specOf(
  [node("a", "Árvore"), node("b", "arvore"), node("c", "Zebra"), node("d", "Mango"), node("e", "Apple")],
  [
    { source: "c", target: "a" },
    { source: "c", target: "d" },
    { source: "c", target: "e" },
    { source: "a", target: "d", weight: 9 },
  ],
);
const ids = ["a", "b", "c", "d", "e"];

describe("orderLocal (spec ranking §2)", () => {
  it("connections: more edges first, ties by folded label then id", () => {
    // c has 3, a and d have 2 (Árvore before Mango), e has 1, b has 0.
    expect(orderLocal(spec, ids, "connections")).toEqual(["c", "a", "d", "e", "b"]);
  });

  it("alphabetical: the folded label, then the id, whatever the input order", () => {
    // Apple, then Árvore and arvore (equal folded, so by id a < b), Mango, Zebra.
    expect(orderLocal(spec, ["e", "d", "c", "b", "a"], "alphabetical")).toEqual(["e", "a", "b", "d", "c"]);
  });

  it("a spec without edges ranks alphabetically under connections", () => {
    const plain = specOf([node("x", "Beta"), node("y", "alpha")]);
    expect(orderLocal(plain, ["x", "y"], "connections")).toEqual(["y", "x"]);
  });

  it("ignores a self-loop and counts a repeated edge once per edge", () => {
    const odd = specOf(
      [node("p", "P"), node("q", "Q")],
      [
        { source: "p", target: "p" },
        { source: "q", target: "p" },
        { source: "q", target: "p" },
      ],
    );
    // Both end with 2 real edges (the self-loop adds nothing); equal, so label order.
    expect(orderLocal(odd, ["q", "p"], "connections")).toEqual(["p", "q"]);
  });

  it("a function rule orders by its score, highest first; non-finite scores sort last", () => {
    const rule = (item: { id: string }) =>
      item.id === "b" ? Number.NaN : item.id === "d" ? 5 : item.id === "a" ? 7 : 1;
    // c and e tie on 1: Apple (e) before Zebra (c).
    expect(orderLocal(spec, ids, rule)).toEqual(["a", "d", "e", "c", "b"]);
  });

  it("the function sees the item and its connection count", () => {
    const seen: [string, number][] = [];
    orderLocal(spec, ["c", "b"], (item, context) => {
      seen.push([item.label, context.connections(item.id)]);
      return 0;
    });
    expect(seen).toContainEqual(["Zebra", 3]);
    expect(seen).toContainEqual(["arvore", 0]);
  });

  it("keeps an id the spec does not know, last among equals, without throwing", () => {
    expect(orderLocal(spec, ["ghost", "c"], "connections")).toEqual(["c", "ghost"]);
  });

  it("drops a repeated id", () => {
    expect(orderLocal(spec, ["c", "c", "a"], "connections")).toEqual(["c", "a"]);
  });

  it("is deterministic: the same ids in any input order give the same output", () => {
    const forward = orderLocal(spec, ids, "connections");
    expect(orderLocal(spec, [...ids].reverse(), "connections")).toEqual(forward);
  });
});

describe("orderAnswer (spec ranking §3)", () => {
  it("keeps a plain id list exactly as returned, dropping repeats after the first", () => {
    expect(orderAnswer(spec, ["e", "c", "e", "a"], "connections")).toEqual(["e", "c", "a"]);
  });

  it("sorts scored ids by score descending; equal scores by the rule, then the tie-break", () => {
    const answer = [
      { id: "e", score: 0.5 },
      { id: "a", score: 0.9 },
      { id: "d", score: 0.5 },
      { id: "c", score: 0.5 },
    ];
    // a first; among 0.5 the rule "connections" puts c (3) before d (2) before e (1).
    expect(orderAnswer(spec, answer, "connections")).toEqual(["a", "c", "d", "e"]);
  });

  it("a non-finite score sorts last and a repeated scored id keeps its first score", () => {
    const answer = [
      { id: "a", score: Number.NaN },
      { id: "b", score: 1 },
      { id: "b", score: 99 },
      { id: "c", score: -Infinity },
    ];
    // b first; a and c both non-finite, so the alphabetical rule: Árvore before Zebra.
    expect(orderAnswer(spec, answer, "alphabetical")).toEqual(["b", "a", "c"]);
  });

  it("an empty answer is empty", () => {
    expect(orderAnswer(spec, [], "connections")).toEqual([]);
  });

  it("throws on a mixed answer, a non-list entry or a malformed object", () => {
    expect(() => orderAnswer(spec, ["a", { id: "b", score: 1 }], "connections")).toThrow(TypeError);
    expect(() => orderAnswer(spec, [{ id: "a" } as never], "connections")).toThrow(TypeError);
    expect(() => orderAnswer(spec, [7 as never], "connections")).toThrow(TypeError);
  });
});

describe("labelOf", () => {
  it("is the node's label, or the id for an id the spec does not have", () => {
    expect(labelOf(spec, "c")).toBe("Zebra");
    expect(labelOf(spec, "ghost")).toBe("ghost");
  });
});

describe("orderAnswer calls a rank function once per id (whole-branch review)", () => {
  it("scores each tied id once, not once per comparison", () => {
    const calls: string[] = [];
    const ids = Array.from({ length: 20 }, (_, index) => ({ id: `n${index}`, score: 1 }));
    const nodes = ids.map((entry, index) => ({ id: entry.id, label: entry.id, x: index, y: 0, territory: null }));
    orderAnswer({ version: "1", territories: [], nodes }, ids, (item) => {
      calls.push(item.id);
      return 0;
    });
    expect(calls.length).toBeLessThanOrEqual(ids.length);
  });
});
