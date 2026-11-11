import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import fixture from "../fixtures/atlas/trails.map-spec.json";
import { CorpusMap } from "../src/CorpusMap";
import { validateSpec } from "../src/shared/spec";

// The document the corpus_atlas gem serves for its example trails (see the
// gem's script/export_map_spec_fixture.rb): the contract between the two
// repositories, rendered by this library's own code. The file is the script's
// output run through `biome format` (same data, this repository's layout).
describe("the map spec the corpus_atlas gem serves", () => {
  const spec = validateSpec(fixture);

  it("passes this library's own validator", () => {
    expect(spec.territories).toHaveLength(6);
    expect(spec.nodes).toHaveLength(12);
    expect(spec.nodes.every((node) => node.territory !== null)).toBe(true);
  });

  it("mounts without throwing and names every territory with its item count", () => {
    render(<CorpusMap spec={spec} renderCard={(node) => <div>{node.label}</div>} width={800} height={600} />);
    for (const territory of spec.territories) {
      const count = spec.nodes.filter((node) => node.territory === territory.id).length;
      expect(screen.getByRole("button", { name: `${territory.name}, ${count} items` })).toBeTruthy();
    }
  });

  it("lists every node under its territory", async () => {
    const user = userEvent.setup();
    render(<CorpusMap spec={spec} renderCard={(node) => <div>{node.label}</div>} width={800} height={600} />);
    for (const territory of spec.territories) {
      const members = spec.nodes.filter((node) => node.territory === territory.id);
      await user.click(screen.getByRole("button", { name: `${territory.name}, ${members.length} items` }));
      for (const node of members) expect(screen.getByRole("button", { name: node.label })).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Back to overview" }));
    }
  });

  it("is rejected when a node names a territory the document lacks (control: the validator can fail)", () => {
    const broken = structuredClone(fixture);
    broken.nodes = broken.nodes.map((node, index) =>
      index === 0 ? { ...node, territory: "no-such-territory" } : node,
    );
    expect(() => validateSpec(broken)).toThrow();
  });
});
