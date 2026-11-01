import { compareIds } from "../shared/compareIds";
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
  return compareIds(first.neighbour, second.neighbour);
}

/** One edge index per spec object; a spec is never mutated, so a new spec is a new key. */
const relatedBySpec = new WeakMap<Pick<MapSpec, "edges">, ReadonlyMap<string, readonly RelatedEdge[]>>();

/**
 * Every item's related items, both directions of each undirected edge,
 * heaviest first, absent weights last, ties by id. Built once per spec
 * object: the scene builds it while the map loads, and `relatedItems` reads
 * the same index, so not even the first selection walks every edge again.
 */
export function buildRelated(spec: Pick<MapSpec, "edges">): ReadonlyMap<string, readonly RelatedEdge[]> {
  const known = relatedBySpec.get(spec);
  if (known) return known;
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
  relatedBySpec.set(spec, related);
  return related;
}

/** A related item with the edge's weight and reason, as the related list and `relatedItems` give it. */
export interface RelatedItem {
  node: MapNode;
  weight: number | undefined;
  reason: string | undefined;
}

/** One id index per spec object, like `buildRelated`'s edge index. */
const nodesBySpec = new WeakMap<MapSpec, ReadonlyMap<string, MapNode>>();

function nodesOf(spec: MapSpec): ReadonlyMap<string, MapNode> {
  const known = nodesBySpec.get(spec);
  if (known) return known;
  const byId = new Map(spec.nodes.map((node) => [node.id, node]));
  nodesBySpec.set(spec, byId);
  return byId;
}

/**
 * `id`'s related items, heaviest first, absent weights last, then by id (spec
 * slice E §6). The indexes are built once per spec object and kept while
 * the spec lives: rebuilding them for every selection took about 100 ms of a
 * tap on arXiv at the 4× CPU slowdown spec mobile §7 measures with. So a
 * spec is never mutated in place: after changing its edges or nodes, pass a
 * new spec object, or this keeps answering from the old index.
 */
export function relatedItems(spec: MapSpec, id: string): RelatedItem[] {
  const byId = nodesOf(spec);
  return (buildRelated(spec).get(id) ?? []).map((edge) => ({
    node: byId.get(edge.neighbour) as MapNode,
    weight: edge.weight,
    reason: edge.reason,
  }));
}
