import { describe, expect, it } from "vitest";
import { type MapSpec, validateSpec } from "../../src/shared/spec";
import { deriveTerritoryGroups } from "../../src/territories/groups";
import type { GroupNamesFile } from "./groupNamesFile";
import { staleGroups } from "./stale";

/** Twelve territories in three tight clumps far apart: three derived groups. */
function clumps(): MapSpec {
  const territories = Array.from({ length: 12 }, (_unused, index) => {
    const id = `t${String(index).padStart(2, "0")}`;
    return {
      id,
      name: id,
      members: Array.from({ length: 12 - index }, (_item, item) => `${id}-${item}`),
      centroid: [Math.floor(index / 4) * 1000 + (index % 4), 0] as [number, number],
    };
  });
  const nodes = territories.flatMap((territory) =>
    territory.members.map((id) => ({ id, label: id, x: 0, y: 0, territory: territory.id })),
  );
  return validateSpec({ version: "1", territories, nodes });
}

function freshFile(spec: MapSpec): GroupNamesFile {
  return {
    model: "claude-opus-5-5",
    namedAt: "2026-10-25",
    promptVersion: 1,
    groups: deriveTerritoryGroups(spec).map((group, index) => ({ name: `Name ${index}`, members: group.members })),
  };
}

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
});
