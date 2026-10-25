import type { MapSpec } from "../../src/shared/spec";
import { deriveTerritoryGroups } from "../../src/territories/groups";
import type { GroupNamesFile } from "./groupNamesFile";

const list = (members: readonly string[]) => members.join(", ");

function sameMembers(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((member) => second.includes(member));
}

function overlap(first: readonly string[], second: readonly string[]): number {
  return first.filter((member) => second.includes(member)).length;
}

/**
 * How a names file differs from the groups the spec derives today, ignoring
 * any `group` the spec already carries (spec slice F §3): a named group whose
 * members changed (paired with the derived group it shares most members with),
 * a derived group with no name, and a named group that no longer derives.
 * Empty means the file is fresh.
 */
export function staleGroups(spec: MapSpec, file: GroupNamesFile): string[] {
  const unnamed: MapSpec = {
    ...spec,
    territories: spec.territories.map(({ group: _group, ...territory }) => territory),
  };
  const derived = deriveTerritoryGroups(unnamed);
  const unmatchedDerived = derived.filter(
    (group) => !file.groups.some((named) => sameMembers(named.members, group.members)),
  );
  const unmatchedNamed = file.groups.filter(
    (named) => !derived.some((group) => sameMembers(named.members, group.members)),
  );

  const changed: string[] = [];
  const gone: string[] = [];
  for (const named of unmatchedNamed) {
    const best = unmatchedDerived
      .map((group) => ({ group, shared: overlap(named.members, group.members) }))
      .filter((candidate) => candidate.shared > 0)
      .sort((first, second) => second.shared - first.shared)[0];
    if (best === undefined) {
      gone.push(`"${named.name}" (${list(named.members)}) no longer derives`);
      continue;
    }
    unmatchedDerived.splice(unmatchedDerived.indexOf(best.group), 1);
    changed.push(`"${named.name}" changed members: was ${list(named.members)}; now ${list(best.group.members)}`);
  }
  const missing = unmatchedDerived.map((group) => `derived group ${group.id} (${list(group.members)}) has no name`);
  return [...changed, ...missing, ...gone];
}
