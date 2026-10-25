import { type MapSpec, validateSpec } from "../../src/shared/spec";
import { deriveTerritoryGroups } from "../../src/territories/groups";
import type { GroupNamesFile } from "./groupNamesFile";

/** Twelve territories in three tight clumps far apart: three derived groups (test fixture). */
export function clumps(): MapSpec {
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

/** A names file that matches what the spec derives today, named "Name 0", "Name 1", ... */
export function freshFile(spec: MapSpec): GroupNamesFile {
  return {
    model: "claude-opus-5-5",
    namedAt: "2026-10-25",
    promptVersion: 1,
    groups: deriveTerritoryGroups(spec).map((group, index) => ({ name: `Name ${index}`, members: group.members })),
  };
}

/** `file` with the group at `index` renamed to `name`. */
export function renamed(file: GroupNamesFile, index: number, name: string): GroupNamesFile {
  return { ...file, groups: file.groups.map((group, position) => (position === index ? { ...group, name } : group)) };
}
