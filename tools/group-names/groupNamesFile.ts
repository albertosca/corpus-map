import type { TerritoryGroup } from "../../src/territories/groups";

/**
 * Names for a corpus's derived groups, written once by the group-names tool
 * and committed beside the corpus (spec slice F §3). `members` are territory
 * ids, in `deriveTerritoryGroups`' order, so a re-derivation can be compared
 * with what was named.
 */
export interface GroupNamesFile {
  /** The model that answered (a fallback model, if one ran). */
  model: string;
  /** YYYY-MM-DD. */
  namedAt: string;
  promptVersion: number;
  groups: { name: string; members: string[] }[];
}

export type GroupNamesProvenance = Pick<GroupNamesFile, "model" | "namedAt" | "promptVersion">;

export function toGroupNamesFile(
  groups: readonly TerritoryGroup[],
  names: ReadonlyMap<string, string>,
  provenance: GroupNamesProvenance,
): GroupNamesFile {
  return {
    ...provenance,
    groups: groups.map((group) => {
      const name = names.get(group.id);
      if (name === undefined) throw new Error(`No name for group ${group.id}`);
      return { name, members: [...group.members] };
    }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The corpus body with `group` set on every territory from the file, before
 * `validateSpec` (spec slice F §4). Returns the body itself when it already
 * declares `group` or `parent` (a supplied grouping wins) or when the file
 * does not cover every territory exactly once: a stale file leaves the
 * provisional names in place rather than taking the demo down, and the
 * corpus's staleness test fails instead.
 */
export function withGroupNames(body: unknown, file: GroupNamesFile): unknown {
  if (!isRecord(body) || !Array.isArray(body.territories)) return body;
  const territories: unknown[] = body.territories;
  if (!territories.every(isRecord)) return body;
  if (territories.some((territory) => territory.group !== undefined || territory.parent !== undefined)) return body;

  const groupOf = new Map<unknown, string>();
  for (const group of file.groups) {
    for (const member of group.members) {
      if (groupOf.has(member)) return body;
      groupOf.set(member, group.name);
    }
  }
  if (groupOf.size !== territories.length || !territories.every((territory) => groupOf.has(territory.id))) {
    return body;
  }
  return {
    ...body,
    territories: territories.map((territory) => ({ ...territory, group: groupOf.get(territory.id) })),
  };
}
