import { facetsOf } from "corpus-map/filter";
import { describe, expect, it } from "vitest";
import { arxivSpec, gallery } from ".";
import arxivJson from "./arxiv.json";
import { arxivCategory } from "./arxivFilter";

describe("arxivCategory (spec filter §6)", () => {
  it("reads the id as the value and 'id: name' as the label", () => {
    const node = {
      id: "p",
      label: "P",
      x: 0,
      y: 0,
      territory: null,
      meta: { category: { id: "cs.AI", name: "Artificial Intelligence" } },
    };
    expect(arxivCategory(node)).toEqual({ value: "cs.AI", label: "cs.AI: Artificial Intelligence" });
  });

  it.each([undefined, null, {}, { category: null }, { category: { id: "cs.AI" } }, { category: { id: 1, name: "x" } }])(
    "gives nothing for a node whose meta is %j",
    (meta) => {
      expect(arxivCategory({ id: "p", label: "P", x: 0, y: 0, territory: null, meta })).toBeUndefined();
    },
  );

  it("covers every paper of the shipped corpus, each under a labelled category", () => {
    const spec = arxivSpec(arxivJson);
    const facets = facetsOf(spec, arxivCategory);
    expect(facets.reduce((total, facet) => total + facet.count, 0)).toBe(spec.nodes.length);
    for (const facet of facets) expect(facet.label).toMatch(/^cs\.[A-Za-z-]+: .+/);
  });

  it("is declared by the arXiv entry alone", () => {
    expect(gallery.filter((entry) => entry.filter !== undefined).map((entry) => entry.id)).toEqual(["arxiv"]);
  });
});
