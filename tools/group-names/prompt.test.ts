import { describe, expect, it } from "vitest";
import { type MapSpec, validateSpec } from "../../src/shared/spec";
import type { TerritoryGroup } from "../../src/territories/groups";
import { buildGroupNamesPrompt, GROUP_NAMES_PROMPT_VERSION, SAMPLE_LABELS_PER_GROUP, sampleLabels } from "./prompt";

function corpus(sizes: Record<string, number>): MapSpec {
  const territories = Object.entries(sizes).map(([id, size], index) => ({
    id,
    name: `Name ${id}`,
    members: Array.from({ length: size }, (_unused, item) => `${id}-${item}`),
    centroid: [index, 0] as [number, number],
  }));
  const nodes = territories.flatMap((territory) =>
    territory.members.map((id) => ({ id, label: `Label ${id}`, x: 0, y: 0, territory: territory.id })),
  );
  return validateSpec({ version: "1", territories, nodes });
}

const group = (id: string, members: string[]): TerritoryGroup => ({ id, name: "provisional", members });

describe("sampleLabels", () => {
  it("takes labels round-robin from the members in member order", () => {
    const spec = corpus({ a: 3, b: 2, c: 1 });
    expect(sampleLabels(spec, group("group:a", ["a", "b", "c"]))).toEqual([
      "Label a-0",
      "Label b-0",
      "Label c-0",
      "Label a-1",
      "Label b-1",
      "Label a-2",
    ]);
  });

  it("stops at the cap", () => {
    const spec = corpus({ a: 20, b: 20 });
    const labels = sampleLabels(spec, group("group:a", ["a", "b"]));
    expect(labels).toHaveLength(SAMPLE_LABELS_PER_GROUP);
    expect(labels.slice(0, 4)).toEqual(["Label a-0", "Label b-0", "Label a-1", "Label b-1"]);
  });
});

describe("buildGroupNamesPrompt", () => {
  const spec = corpus({ a: 1234, b: 2, c: 5 });
  const groups = [group("group:a", ["a", "b"]), group("group:c", ["c"])];
  const prompt = buildGroupNamesPrompt(spec, groups);

  it("carries every group id, member name and item count", () => {
    for (const id of ["group:a", "group:c"]) expect(prompt).toContain(id);
    expect(prompt).toContain("Name a (1,234 items)");
    expect(prompt).toContain("Name b (2 items)");
    expect(prompt).toContain("Name c (5 items)");
    expect(prompt).toContain("Label c-4");
  });

  it("states the rules, the answer's shape and its version", () => {
    expect(prompt).toContain("at most 24 characters");
    expect(prompt).toContain('never "Other"');
    expect(prompt).toContain("different from each other");
    expect(prompt).toContain("language");
    expect(prompt).toContain('{"names": {"<group id>": "<name>"}}');
    expect(prompt).toContain(`version ${GROUP_NAMES_PROMPT_VERSION}`);
  });

  it("is the same string for the same spec", () => {
    expect(buildGroupNamesPrompt(spec, groups)).toBe(prompt);
  });
});
