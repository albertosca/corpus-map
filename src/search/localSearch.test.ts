import { describe, expect, it } from "vitest";
import type { MapNode, MapSpec } from "../shared/spec";
import { advance } from "../shared/steps";
import { buildSearchIndex, foldText, localSearch, searchIndexOf } from "./localSearch";

const node = (id: string, label: string, meta?: unknown): MapNode => ({
  id,
  label,
  x: 0,
  y: 0,
  territory: null,
  ...(meta === undefined ? {} : { meta }),
});
const specOf = (nodes: MapNode[]): MapSpec => ({ version: "1", territories: [], nodes });

describe("foldText (spec search §4)", () => {
  it("lowers the case and strips accents", () => {
    expect(foldText("Ação Éléctrica")).toBe("acao electrica");
  });
});

describe("localSearch", () => {
  const spec = specOf([
    node("one", "Graph Neural Networks", { category: "cs.LG", year: 2021 }),
    node("two", "Árvores de decisão", { category: "cs.AI" }),
    node("three", "Neural rendering", { category: "cs.GR", year: 2019 }),
    node("four", "Unrelated", { tags: ["alpha", null, 7], nested: { deep: "needle" }, empty: null }),
  ]);
  const index = searchIndexOf(spec);

  it("requires every word, in any order, from the label and meta mixed", () => {
    expect(localSearch(index, "neural graph")).toEqual(["one"]);
    expect(localSearch(index, "neural cs.gr")).toEqual(["three"]);
  });

  it("keeps the spec order", () => {
    expect(localSearch(index, "neural")).toEqual(["one", "three"]);
  });

  it("folds case and accents on both sides", () => {
    expect(localSearch(index, "ARVORES decisao")).toEqual(["two"]);
  });

  it("matches numbers and nested or array meta values without throwing", () => {
    expect(localSearch(index, "2021")).toEqual(["one"]);
    expect(localSearch(index, "7 alpha")).toEqual(["four"]);
    expect(localSearch(index, "needle")).toEqual(["four"]);
  });

  it("returns nothing for an empty or whitespace-only query", () => {
    expect(localSearch(index, "")).toEqual([]);
    expect(localSearch(index, "   ")).toEqual([]);
  });

  it("does not match the word 'null' from a null meta value", () => {
    expect(localSearch(index, "null")).toEqual([]);
  });

  it("handles a meta that is a plain string, a number, or cyclic", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    const odd = searchIndexOf(specOf([node("s", "A", "plain"), node("n", "B", 42), node("c", "C", cyclic)]));
    expect(localSearch(odd, "plain")).toEqual(["s"]);
    expect(localSearch(odd, "42")).toEqual(["n"]);
    expect(localSearch(odd, "loop")).toEqual(["c"]);
  });

  it("builds the index once per spec object", () => {
    expect(searchIndexOf(spec)).toBe(index);
    expect(searchIndexOf(specOf(spec.nodes))).not.toBe(index);
  });
});

describe("buildSearchIndex (sliced)", () => {
  it("yields at least once per 200 items", () => {
    const big = specOf(Array.from({ length: 1000 }, (_, count) => node(`n${count}`, `Item ${count}`)));
    const steps = buildSearchIndex(big);
    let slices = 0;
    for (;;) {
      const progress = advance(steps, 1);
      if (progress.done) {
        expect(progress.value.ids).toHaveLength(1000);
        break;
      }
      slices += 1;
    }
    expect(slices).toBeGreaterThanOrEqual(5);
  });
});
