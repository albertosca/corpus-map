import type { MapNode, MapSpec } from "../shared/spec";

/** One end of an undirected edge, seen from the other end (spec slice E §6). */
export interface RelatedEdge {
  neighbour: string;
  weight: number | undefined;
  reason: string | undefined;
}

function heavierFirst(first: RelatedEdge, second: RelatedEdge): number {
  const firstWeight = first.weight ?? Number.NEGATIVE_INFINITY;
  const secondWeight = second.weight ?? Number.NEGATIVE_INFINITY;
  if (firstWeight !== secondWeight) return secondWeight > firstWeight ? 1 : -1;
  return first.neighbour < second.neighbour ? -1 : first.neighbour > second.neighbour ? 1 : 0;
}

/** Every item's related items, both directions of each undirected edge, heaviest first, absent weights last, ties by id. */
export function buildRelated(spec: Pick<MapSpec, "edges">): Map<string, RelatedEdge[]> {
  const related = new Map<string, RelatedEdge[]>();
  const add = (owner: string, neighbour: string, weight: number | undefined, reason: string | undefined) => {
    const list = related.get(owner) ?? [];
    list.push({ neighbour, weight, reason });
    related.set(owner, list);
  };
  for (const edge of spec.edges ?? []) {
    add(edge.source, edge.target, edge.weight, edge.reason);
    add(edge.target, edge.source, edge.weight, edge.reason);
  }
  for (const list of related.values()) list.sort(heavierFirst);
  return related;
}

/** A related item with the edge's weight and reason, as the related list and `relatedItems` give it. */
export interface RelatedItem {
  node: MapNode;
  weight: number | undefined;
  reason: string | undefined;
}

/** `id`'s related items, heaviest first, absent weights last, then by id (spec slice E §6). */
export function relatedItems(spec: MapSpec, id: string): RelatedItem[] {
  const byId = new Map(spec.nodes.map((node) => [node.id, node]));
  return (buildRelated(spec).get(id) ?? []).map((edge) => ({
    node: byId.get(edge.neighbour) as MapNode,
    weight: edge.weight,
    reason: edge.reason,
  }));
}
