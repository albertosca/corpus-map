import type { MapSpec } from "../../src/shared/spec";
import { deriveTerritoryGroups } from "../../src/territories/groups";
import type { GroupNamesFile } from "./groupNamesFile";
import { groupNameProblem } from "./names";

const list = (members: readonly string[]) => members.join(", ");

function sameMembers(first: readonly string[], second: readonly string[]): boolean {
  const sortedSecond = [...second].sort();
  return first.length === second.length && [...first].sort().every((member, index) => member === sortedSecond[index]);
}

function nameProblems(file: GroupNamesFile): string[] {
  const problems: string[] = [];
  const byFoldedName = new Map<string, string>();
  for (const { name } of file.groups) {
    const problem = groupNameProblem(name);
    if (problem !== undefined) problems.push(`"${name}" ${problem}`);
    const folded = name.toLowerCase();
    const earlier = byFoldedName.get(folded);
    if (earlier !== undefined) problems.push(`"${earlier}" and "${name}" share a name`);
    else byFoldedName.set(folded, name);
  }
  return problems;
}

function overlap(first: readonly string[], second: readonly string[]): number {
  return first.filter((member) => second.includes(member)).length;
}

/**
 * How a names file differs from the groups the spec derives today, ignoring
 * any `group` the spec already carries (spec slice F §3): a named group whose
 * members changed (paired with the derived group it shares most members with),
 * a derived group with no name, a named group that no longer derives, and a
 * name the naming rules refuse (`groupNameProblem`, or two names equal
 * ignoring case). Empty means the file is fresh and safe to apply.
 */
export function staleGroups(spec: MapSpec, file: GroupNamesFile): string[] {
  const unnamed: MapSpec = {
    ...spec,
    territories: spec.territories.map(({ group: _group, ...territory }) => territory),
  };
  // One named group per derived group: a second name for the same members is unmatched.
  const unmatchedDerived = deriveTerritoryGroups(unnamed);
  const unmatchedNamed = file.groups.filter((named) => {
    const match = unmatchedDerived.findIndex((group) => sameMembers(named.members, group.members));
    if (match >= 0) unmatchedDerived.splice(match, 1);
    return match < 0;
  });

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
  return [...changed, ...missing, ...gone, ...nameProblems(file)];
}
