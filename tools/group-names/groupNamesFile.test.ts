import { describe, expect, it } from "vitest";
import type { TerritoryGroup } from "../../src/territories/groups";
import { type GroupNamesFile, toGroupNamesFile, withGroupNames } from "./groupNamesFile";

const PROVENANCE = { model: "claude-opus-5-5", namedAt: "2026-10-25", promptVersion: 1 };

const GROUPS: TerritoryGroup[] = [
  { id: "group:a", name: "A +1", members: ["a", "b"] },
  { id: "group:c", name: "C", members: ["c"] },
];

const FILE: GroupNamesFile = {
  ...PROVENANCE,
  groups: [
    { name: "Learning", members: ["a", "b"] },
    { name: "Systems", members: ["c"] },
  ],
};

function body(extra: Record<string, Record<string, unknown>> = {}) {
  return {
    version: "1",
    territories: ["a", "b", "c"].map((id) => ({ id, name: id, members: [], centroid: [0, 0], ...extra[id] })),
    nodes: [{ id: "n", label: "n", x: 0, y: 0, territory: "a" }],
  };
}

describe("toGroupNamesFile", () => {
  it("keeps the groups' order and members, with the provenance", () => {
    const names = new Map([
      ["group:c", "Systems"],
      ["group:a", "Learning"],
    ]);
    expect(toGroupNamesFile(GROUPS, names, PROVENANCE)).toEqual(FILE);
  });

  it("throws on a group without a name", () => {
    expect(() => toGroupNamesFile(GROUPS, new Map([["group:a", "Learning"]]), PROVENANCE)).toThrow(/group:c/);
  });
});

describe("withGroupNames", () => {
  it("sets group on every territory and leaves everything else alone", () => {
    const original = body();
    const named = withGroupNames(original, FILE) as { territories: Array<{ group?: string }>; nodes: unknown };
    expect(named.territories.map((territory) => territory.group)).toEqual(["Learning", "Learning", "Systems"]);
    expect(named.nodes).toBe(original.nodes);
    expect(named.territories[0]).toMatchObject({ id: "a", name: "a", centroid: [0, 0] });
    expect(original.territories[0]).not.toHaveProperty("group");
  });

  const untouched: Array<[string, unknown, GroupNamesFile]> = [
    ["a territory declares group", body({ b: { group: "Mine" } }), FILE],
    ["a territory declares parent", body({ b: { parent: "a" } }), FILE],
    ["the file misses a territory", body(), { ...FILE, groups: [{ name: "Learning", members: ["a", "b"] }] }],
    ["the file repeats a territory", body(), { ...FILE, groups: [...FILE.groups, { name: "Again", members: ["a"] }] }],
    [
      "the file names a territory the spec lacks",
      body(),
      { ...FILE, groups: [...FILE.groups, { name: "Ghost", members: ["z"] }] },
    ],
    ["the body is not an object", "nonsense", FILE],
    ["the body has no territories array", { version: "1", territories: {} }, FILE],
    ["a territory is not an object", { version: "1", territories: [null] }, FILE],
  ];

  it.each(untouched)("returns the body itself when %s", (_case, input, file) => {
    expect(withGroupNames(input, file)).toBe(input);
  });
});
