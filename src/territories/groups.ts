import type { MapSpec, Territory } from "../shared/spec";

/** Territories shown together in the legend and named together on the far map (spec categories §3). */
export interface TerritoryGroup {
  id: string;
  name: string;
  /** Territory ids, most members first, ties by id. */
  members: string[];
}

/** Below this many territories nothing is derived: a short flat list needs no groups. */
export const MINIMUM_DERIVED_TERRITORIES = 10;

/**
 * Above this many nothing is derived either: the clustering below is cubic
 * in the territory count (400 already costs about ten million steps), and a
 * consumer with that many categories can supply `group` instead.
 */
export const MAXIMUM_DERIVED_TERRITORIES = 400;

/** Where a territory without `group` lands when another territory has one. */
export const OTHER_GROUP = "Other";

interface Draft {
  id: string;
  name: string;
  members: Territory[];
}

function compareIds(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function largestFirst(first: Territory, second: Territory): number {
  return second.members.length - first.members.length || compareIds(first.id, second.id);
}

function papers(members: readonly Territory[]): number {
  return members.reduce((total, territory) => total + territory.members.length, 0);
}

/** round(√n) clamped to [3, 8]: 6 for the 38 arXiv categories. */
export function derivedGroupCount(territoryCount: number): number {
  return Math.min(8, Math.max(3, Math.round(Math.sqrt(territoryCount))));
}

function finish(drafts: readonly Draft[]): TerritoryGroup[] {
  return [...drafts]
    .sort((first, second) => papers(second.members) - papers(first.members) || compareIds(first.id, second.id))
    .map((draft) => ({
      id: draft.id,
      name: draft.name,
      members: [...draft.members].sort(largestFirst).map((territory) => territory.id),
    }));
}

function supplied(territories: readonly Territory[]): TerritoryGroup[] {
  const byName = new Map<string, Territory[]>();
  for (const territory of territories) {
    const name = territory.group ?? OTHER_GROUP;
    byName.set(name, [...(byName.get(name) ?? []), territory]);
  }
  return finish([...byName].map(([name, members]) => ({ id: `group:${name}`, name, members })));
}

/**
 * Average-linkage agglomerative clustering of the centroids (UPGMA): the
 * distance between two clusters is the mean distance between their members,
 * kept current by the Lance–Williams update rather than recomputed. Clusters
 * stay sorted by their smallest member id (a merge keeps the lower index),
 * and the scan keeps the first strict minimum, so a tie goes to the pair
 * whose smallest ids come first: the result depends on the spec's content,
 * never on its order.
 */
function cluster(territories: readonly Territory[], target: number): Territory[][] {
  const sorted = [...territories].sort((first, second) => compareIds(first.id, second.id));
  const clusters: Territory[][] = sorted.map((territory) => [territory]);
  const distance: number[][] = sorted.map((first) =>
    sorted.map((second) => Math.hypot(first.centroid[0] - second.centroid[0], first.centroid[1] - second.centroid[1])),
  );
  const distanceAt = (row: number, column: number) => (distance[row] as number[])[column] as number;
  const setDistance = (row: number, column: number, value: number) => {
    (distance[row] as number[])[column] = value;
  };
  while (clusters.length > target) {
    let bestFirst = 0;
    let bestSecond = 1;
    let best = Number.POSITIVE_INFINITY;
    for (let firstIndex = 0; firstIndex < clusters.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < clusters.length; secondIndex += 1) {
        if (distanceAt(firstIndex, secondIndex) < best) {
          best = distanceAt(firstIndex, secondIndex);
          bestFirst = firstIndex;
          bestSecond = secondIndex;
        }
      }
    }
    const first = clusters[bestFirst] as Territory[];
    const second = clusters[bestSecond] as Territory[];
    for (let other = 0; other < clusters.length; other += 1) {
      if (other === bestFirst || other === bestSecond) continue;
      const merged =
        (first.length * distanceAt(other, bestFirst) + second.length * distanceAt(other, bestSecond)) /
        (first.length + second.length);
      setDistance(other, bestFirst, merged);
      setDistance(bestFirst, other, merged);
    }
    clusters[bestFirst] = [...first, ...second];
    clusters.splice(bestSecond, 1);
    distance.splice(bestSecond, 1);
    for (const row of distance) row.splice(bestSecond, 1);
  }
  return clusters;
}

function derived(territories: readonly Territory[]): TerritoryGroup[] {
  return finish(
    cluster(territories, derivedGroupCount(territories.length)).map((members) => {
      const [largest, ...rest] = [...members].sort(largestFirst) as [Territory, ...Territory[]];
      return {
        id: `group:${largest.id}`,
        name: rest.length === 0 ? largest.name : `${largest.name} +${rest.length}`,
        members,
      };
    }),
  );
}

/**
 * The spec's groups: by `group` name when any territory carries one (the
 * rest under "Other"), otherwise derived from the centroids for 10 to 400
 * territories, otherwise none. A pipeline can run this, name the groups and
 * write `group` back into its corpus: that is how derived groups get named.
 */
export function deriveTerritoryGroups(spec: MapSpec): TerritoryGroup[] {
  const { territories } = spec;
  if (territories.some((territory) => territory.group !== undefined)) return supplied(territories);
  if (territories.length < MINIMUM_DERIVED_TERRITORIES || territories.length > MAXIMUM_DERIVED_TERRITORIES) return [];
  return derived(territories);
}
