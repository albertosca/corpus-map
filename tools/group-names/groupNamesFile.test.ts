import { describe, expect, it } from "vitest";
import type { TerritoryGroup } from "../../src/territories/groups";
import { type GroupNamesFile, toGroupNamesFile, withGroupNames } from "./groupNamesFile";
import { clumps, freshFile, renamed } from "./testCorpus";

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
  const spec = clumps();
  const file = freshFile(spec);

  /** The fixture as a corpus body, with `extra` merged into the territory of that id. */
  function body(extra: Record<string, Record<string, unknown>> = {}) {
    return { ...spec, territories: spec.territories.map((territory) => ({ ...territory, ...extra[territory.id] })) };
  }

  it("sets group on every territory and leaves everything else alone", () => {
    const original = body();
    const named = withGroupNames(original, file) as { territories: Array<{ group?: string }>; nodes: unknown };
    expect(named.territories.map((territory) => territory.group)).toEqual([
      ...Array<string>(4).fill("Name 0"),
      ...Array<string>(4).fill("Name 1"),
      ...Array<string>(4).fill("Name 2"),
    ]);
    expect(named.nodes).toBe(original.nodes);
    expect(named.territories[0]).toMatchObject({ id: "t00", name: "t00", centroid: [0, 0] });
    expect(original.territories[0]).not.toHaveProperty("group");
  });

  it("applies the names to a body whose edges are still compact", () => {
    const compact = { ...body(), edges: [[0, 1, 50]] };
    expect((withGroupNames(compact, file) as { territories: Array<{ group?: string }> }).territories[0]?.group).toBe(
      "Name 0",
    );
  });

  const moved: GroupNamesFile = {
    ...file,
    groups: [
      { name: "Name 0", members: ["t00", "t01", "t02"] },
      { name: "Name 1", members: ["t03", "t04", "t05", "t06", "t07"] },
      { name: "Name 2", members: ["t08", "t09", "t10", "t11"] },
    ],
  };

  const untouched: Array<[string, unknown, GroupNamesFile]> = [
    ["a territory declares group", body({ t01: { group: "Mine" } }), file],
    ["a territory declares parent", body({ t01: { parent: "t00" } }), file],
    ["the file covers every territory with a partition the spec no longer derives", body(), moved],
    ["the file misses a territory", body(), { ...file, groups: file.groups.slice(0, 2) }],
    [
      "the file repeats a territory",
      body(),
      { ...file, groups: [...file.groups, { name: "Again", members: ["t00"] }] },
    ],
    [
      "the file names a territory the spec lacks",
      body(),
      { ...file, groups: [...file.groups, { name: "Ghost", members: ["z"] }] },
    ],
    ["the file carries a name the rules refuse", body(), renamed(file, 0, "Other")],
    ["the body is not a valid spec", { ...body(), nodes: "no" }, file],
    ["the body is not an object", "nonsense", file],
    ["the body has no territories array", { version: "1", territories: {} }, file],
    ["a territory is not an object", { version: "1", territories: [null] }, file],
  ];

  it.each(untouched)("returns the body itself when %s", (_case, input, names) => {
    expect(withGroupNames(input, names)).toBe(input);
  });
});
