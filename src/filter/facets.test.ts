import { describe, expect, it } from "vitest";
import type { MapNode, MapSpec } from "../shared/spec";
import { type FilterAttribute, facetsOf, idsMatching, intersectMatches } from "./facets";

const node = (id: string, meta?: unknown): MapNode => ({
  id,
  label: id,
  x: 0,
  y: 0,
  territory: null,
  ...(meta === undefined ? {} : { meta }),
});
const specOf = (nodes: MapNode[]): MapSpec => ({ version: "1", territories: [], nodes });
const kinds: FilterAttribute = (current) => (current.meta as { kind?: string | string[] } | undefined)?.kind;

const animals = specOf([
  node("sparrow", { kind: "bird" }),
  node("dog", { kind: ["mammal", "pet"] }),
  node("cat", { kind: ["mammal", "pet", "pet"] }),
  node("eagle", { kind: "bird" }),
  node("rock"),
  node("blank", { kind: ["", "bird"] }),
]);

describe("facetsOf (spec filter §3)", () => {
  it("counts each item once per value, skipping empty values and items with none", () => {
    expect(facetsOf(animals, kinds)).toEqual([
      { value: "bird", label: "bird", count: 3 },
      { value: "mammal", label: "mammal", count: 2 },
      { value: "pet", label: "pet", count: 2 },
    ]);
  });

  it("sorts by label, then by value, so a row never moves", () => {
    const labelled: FilterAttribute = (current) =>
      ({
        one: { value: "b", label: "Same" },
        two: { value: "a", label: "Same" },
        three: { value: "c", label: "Alpha" },
      })[current.id];
    const spec = specOf([node("one"), node("two"), node("three")]);
    expect(facetsOf(spec, labelled).map((facet) => facet.value)).toEqual(["c", "a", "b"]);
  });

  it("keeps the first label in spec order when one value carries two", () => {
    const labelled: FilterAttribute = (current) => ({ value: "v", label: `label of ${current.id}` });
    expect(facetsOf(specOf([node("first"), node("second")]), labelled)).toEqual([
      { value: "v", label: "label of first", count: 2 },
    ]);
  });

  it("falls back to the value when a label is empty", () => {
    const empty: FilterAttribute = () => ({ value: "v", label: "" });
    expect(facetsOf(specOf([node("only")]), empty)).toEqual([{ value: "v", label: "v", count: 1 }]);
  });

  it("is empty when no item has the attribute", () => {
    expect(facetsOf(specOf([node("rock")]), kinds)).toEqual([]);
  });
});

describe("idsMatching (spec filter §3)", () => {
  it("keeps items having any selected value, in spec order, each once", () => {
    expect(idsMatching(animals, kinds, ["pet", "bird"])).toEqual(["sparrow", "dog", "cat", "eagle", "blank"]);
  });

  it("returns null for an empty selection: no filter is active", () => {
    expect(idsMatching(animals, kinds, [])).toBeNull();
    expect(idsMatching(animals, kinds, new Set())).toBeNull();
  });

  it("returns an empty list, not null, when no item has the selected values", () => {
    expect(idsMatching(animals, kinds, ["fish"])).toEqual([]);
  });

  it("accepts a set", () => {
    expect(idsMatching(animals, kinds, new Set(["mammal"]))).toEqual(["dog", "cat"]);
  });
});

describe("intersectMatches (spec filter §3)", () => {
  it("treats null as no constraint", () => {
    expect(intersectMatches(null, null)).toBeNull();
    expect(intersectMatches(null, ["a"])).toEqual(["a"]);
    expect(intersectMatches(["a"], null)).toEqual(["a"]);
  });

  it("keeps the ids in both, in the order of the first", () => {
    expect(intersectMatches(["c", "a", "b"], ["b", "c"])).toEqual(["c", "b"]);
  });

  it("is an empty list, not null, when the two do not meet", () => {
    expect(intersectMatches(["a"], ["b"])).toEqual([]);
  });
});
