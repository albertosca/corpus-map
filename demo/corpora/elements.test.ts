import { describe, expect, it } from "vitest";
import { validateSpec } from "../../src/shared/spec";
import { deriveTerritoryGroups } from "../../src/territories/groups";
import { elementsSpec } from "./elements";

describe("the elements corpus", () => {
  it("is the gallery's declared-parent corpus: metals and nonmetals are named families, metalloids stand alone", () => {
    const groups = deriveTerritoryGroups(validateSpec(elementsSpec));
    // Groups and their members run largest first (32, 16 and 6 elements), ties by id.
    expect(groups.map((group) => [group.name, group.members])).toEqual([
      ["Metals", ["transition-metals", "alkali-metals", "alkaline-earth", "post-transition"]],
      ["Nonmetals", ["nonmetals", "noble-gases", "halogens"]],
      ["Metalloids", ["metalloids"]],
    ]);
  });

  it("places each family at the mean of its children's elements, like the leaves", () => {
    const metals = elementsSpec.territories.find((territory) => territory.id === "family-metals");
    const nodes = elementsSpec.nodes.filter((node) =>
      ["alkali-metals", "alkaline-earth", "transition-metals", "post-transition"].includes(node.territory ?? ""),
    );
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(metals?.centroid).toEqual([mean(nodes.map((node) => node.x)), mean(nodes.map((node) => node.y))]);
  });
});
