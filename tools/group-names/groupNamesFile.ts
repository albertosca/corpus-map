import { validateSpec } from "../../src/shared/spec";
import type { TerritoryGroup } from "../../src/territories/groups";
import { staleGroups } from "./stale";

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

function isFresh(body: Record<string, unknown>, file: GroupNamesFile): boolean {
  // Naming never reads edges, and a corpus may ship them compact (arXiv does).
  const { edges: _edges, ...rest } = body;
  try {
    return staleGroups(validateSpec(rest), file).length === 0;
  } catch {
    return false;
  }
}

/**
 * The corpus body with `group` set on every territory from the file, before
 * `validateSpec` (spec slice F §4). Returns the body itself when it already
 * declares `group` or `parent` (a supplied grouping wins), when it is not a
 * valid spec, or when `staleGroups` finds any difference between the file and
 * what the body derives today: a stale file leaves the provisional names in
 * place rather than taking the demo down or painting a grouping the map no
 * longer has, and the corpus's staleness test fails instead.
 */
export function withGroupNames(body: unknown, file: GroupNamesFile): unknown {
  if (!isRecord(body) || !Array.isArray(body.territories)) return body;
  const territories: unknown[] = body.territories;
  if (!territories.every(isRecord)) return body;
  if (territories.some((territory) => territory.group !== undefined || territory.parent !== undefined)) return body;
  if (!isFresh(body, file)) return body;

  const groupOf = new Map<unknown, string>();
  for (const group of file.groups) for (const member of group.members) groupOf.set(member, group.name);
  return {
    ...body,
    territories: territories.map((territory) => ({ ...territory, group: groupOf.get(territory.id) })),
  };
}
