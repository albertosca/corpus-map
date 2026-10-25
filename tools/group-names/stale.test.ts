import { describe, expect, it } from "vitest";
import { deriveTerritoryGroups } from "../../src/territories/groups";
import type { GroupNamesFile } from "./groupNamesFile";
import { staleGroups } from "./stale";
import { clumps, freshFile, renamed } from "./testCorpus";

describe("staleGroups", () => {
  const spec = clumps();

  it("derives three groups from the fixture", () => {
    expect(deriveTerritoryGroups(spec).map((group) => group.members)).toEqual([
      ["t00", "t01", "t02", "t03"],
      ["t04", "t05", "t06", "t07"],
      ["t08", "t09", "t10", "t11"],
    ]);
  });

  it("is empty for a fresh file", () => {
    expect(staleGroups(spec, freshFile(spec))).toEqual([]);
  });

  it("ignores group already written on the spec", () => {
    const named = { ...spec, territories: spec.territories.map((territory) => ({ ...territory, group: "X" })) };
    expect(staleGroups(named, freshFile(spec))).toEqual([]);
  });

  it("reports a group whose members changed", () => {
    const file = freshFile(spec);
    const moved: GroupNamesFile = {
      ...file,
      groups: [
        { name: "Name 0", members: ["t00", "t01", "t02"] },
        { name: "Name 1", members: ["t04", "t05", "t06", "t07", "t03"] },
        { name: "Name 2", members: ["t11", "t10", "t09", "t08"] },
      ],
    };
    expect(staleGroups(spec, moved)).toEqual([
      '"Name 0" changed members: was t00, t01, t02; now t00, t01, t02, t03',
      '"Name 1" changed members: was t04, t05, t06, t07, t03; now t04, t05, t06, t07',
    ]);
  });

  it("reports a derived group with no name and a named group that no longer derives", () => {
    const file = freshFile(spec);
    const changed = { ...file, groups: [...file.groups.slice(0, 2), { name: "Gone", members: ["z1"] }] };
    expect(staleGroups(spec, changed)).toEqual([
      "derived group group:t08 (t08, t09, t10, t11) has no name",
      '"Gone" (z1) no longer derives',
    ]);
  });

  it("does not match a named group that repeats a member to a derived group of the same size", () => {
    const file = freshFile(spec);
    const repeated: GroupNamesFile = {
      ...file,
      groups: [{ name: "Name 0", members: ["t00", "t00", "t01", "t02"] }, ...file.groups.slice(1)],
    };
    expect(staleGroups(spec, repeated)).toEqual([
      '"Name 0" changed members: was t00, t00, t01, t02; now t00, t01, t02, t03',
    ]);
  });

  it("matches each derived group to one named group only", () => {
    const file = freshFile(spec);
    const twice: GroupNamesFile = {
      ...file,
      groups: [...file.groups, { name: "Again", members: ["t00", "t01", "t02", "t03"] }],
    };
    expect(staleGroups(spec, twice)).toEqual(['"Again" (t00, t01, t02, t03) no longer derives']);
  });

  it.each([
    ["empty", "", /is empty/],
    ["invisible", "\u200b ", /is empty/],
    ["too long", "x".repeat(25), /longer than 24/],
    ["Other", "other", /"Other"/],
  ])("reports a name the rules refuse: %s", (_case, name, message) => {
    const problems = staleGroups(spec, renamed(freshFile(spec), 0, name));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(message);
  });

  it("reports two names equal ignoring case", () => {
    expect(staleGroups(spec, renamed(freshFile(spec), 1, "NAME 0"))).toEqual(['"Name 0" and "NAME 0" share a name']);
  });
});
