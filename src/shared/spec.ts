import { isSupportedColour } from "../labels/contrast";

export type NodeState = "visited" | "unvisited";

export interface MapNode {
  id: string;
  label: string;
  x: number;
  y: number;
  territory: string | null;
  state?: NodeState;
  badges?: string[];
  meta?: unknown;
}

export interface Territory {
  id: string;
  name: string;
  members: string[];
  centroid: [number, number];
  boundary?: Array<[number, number]>;
  /** Overrides the palette for this territory; `#rrggbb`, `rgb()` or `rgba()`. */
  colour?: string;
  /**
   * The group this territory belongs to, by display name; territories with
   * the same `group` share one. If any territory carries it, groups are not
   * derived and the others fall under "Other" (spec categories §3).
   */
  group?: string;
  /**
   * The id of this territory's parent (spec slice E §3). A parent is any
   * territory another one names here; it lists no members of its own, its
   * members are its children's. Two levels only; a node belongs to a leaf.
   */
  parent?: string;
}

/** An undirected link between two items (spec slice E §6). */
export interface MapEdge {
  source: string;
  target: string;
  /** Finite and >= 0; heavier edges are drawn first and thicker. */
  weight?: number;
  /** Why the two are related, shown in the related list. */
  reason?: string;
}

export interface MapSpec {
  version: "1";
  territories: Territory[];
  nodes: MapNode[];
  edges?: MapEdge[];
}

/** Ids of the territories some other territory names as `parent`. */
export function parentIds(spec: Pick<MapSpec, "territories">): Set<string> {
  const ids = new Set<string>();
  for (const territory of spec.territories) if (territory.parent !== undefined) ids.add(territory.parent);
  return ids;
}

/** The territories that hold items: every territory no other one names as `parent`, in spec order. */
export function leafTerritories(spec: Pick<MapSpec, "territories">): Territory[] {
  const parents = parentIds(spec);
  return spec.territories.filter((territory) => !parents.has(territory.id));
}

export class SpecError extends Error {}

function fail(path: string, detail: string): never {
  throw new SpecError(`${path}: ${detail}`);
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "expected an object");
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, `expected a string, got ${typeof value}`);
  return value;
}

function requireFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(path, `expected a finite number, got ${String(value)}`);
  return value;
}

function requirePoint(value: unknown, path: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) fail(path, "expected a pair of finite numbers");
  return [requireFinite(value[0], `${path}[0]`), requireFinite(value[1], `${path}[1]`)];
}

/**
 * The validator is the contract: everything the renderer relies on is
 * checked here, and nothing else in the library defends against a malformed
 * spec. Membership is checked in both directions — a node that claims a
 * territory must be listed in it, and a listed member must claim it — so the
 * painter (which walks `members`) and the tree (which walks `territory`)
 * agree on which nodes a territory holds. Parents (two levels, nodes only
 * in leaves) and edges are checked here too. `meta` is never read.
 */
export function validateSpec(input: unknown): MapSpec {
  const raw = requireObject(input, "spec");
  if (raw.version !== "1") fail("version", 'expected "1"');
  const territories = requireArray(raw.territories, "territories");
  const nodes = requireArray(raw.nodes, "nodes");

  const members = new Map<string, Set<string>>();
  for (const [index, entry] of territories.entries()) {
    const path = `territories[${index}]`;
    const territory = requireObject(entry, path);
    const id = requireString(territory.id, `${path}.id`);
    if (members.has(id)) fail(`${path}.id`, `duplicate id ${id}`);
    requireString(territory.name, `${path}.name`);
    requireArray(territory.members, `${path}.members`);
    requirePoint(territory.centroid, `${path}.centroid`);
    if (territory.boundary !== undefined) {
      for (const [pointIndex, point] of requireArray(territory.boundary, `${path}.boundary`).entries()) {
        requirePoint(point, `${path}.boundary[${pointIndex}]`);
      }
    }
    if (territory.colour !== undefined) {
      const colour = requireString(territory.colour, `${path}.colour`);
      if (!isSupportedColour(colour))
        fail(`${path}.colour`, `unsupported colour ${colour}; use #rrggbb, rgb() or rgba()`);
    }
    if (territory.group !== undefined) {
      const group = requireString(territory.group, `${path}.group`);
      if (group.trim() === "") fail(`${path}.group`, "expected a non-empty string");
    }
    if (territory.parent !== undefined) requireString(territory.parent, `${path}.parent`);
    members.set(id, new Set());
  }

  const typed = territories as Territory[];
  const declaredParents = new Set<string>();
  for (const [index, territory] of typed.entries()) {
    if (territory.parent === undefined) continue;
    const path = `territories[${index}].parent`;
    if (territory.parent === territory.id) fail(path, "a territory cannot be its own parent");
    if (!members.has(territory.parent)) fail(path, `unknown territory ${territory.parent}`);
    declaredParents.add(territory.parent);
  }
  for (const [index, territory] of typed.entries()) {
    if (!declaredParents.has(territory.id)) continue;
    const path = `territories[${index}]`;
    if (territory.parent !== undefined)
      fail(`${path}.parent`, `parent ${territory.id} itself has a parent; two levels only`);
    if (territory.members.length > 0)
      fail(`${path}.members`, "a parent lists no members of its own; its members are its children's");
  }
  if (declaredParents.size > 0 && typed.some((territory) => territory.group !== undefined))
    fail("territories", "parent and group cannot be mixed in one spec");

  const claimed = new Map<string, string | null>();
  for (const [index, entry] of nodes.entries()) {
    const path = `nodes[${index}]`;
    const node = requireObject(entry, path);
    const id = requireString(node.id, `${path}.id`);
    if (claimed.has(id)) fail(`${path}.id`, `duplicate id ${id}`);
    requireString(node.label, `${path}.label`);
    requireFinite(node.x, `${path}.x`);
    requireFinite(node.y, `${path}.y`);
    const territory = node.territory === null ? null : requireString(node.territory, `${path}.territory`);
    if (territory !== null && !members.has(territory)) fail(`${path}.territory`, `unknown territory ${territory}`);
    if (territory !== null && declaredParents.has(territory))
      fail(`${path}.territory`, `${territory} is a parent; a node belongs to a leaf`);
    claimed.set(id, territory);
  }

  for (const [index, entry] of territories.entries()) {
    const territory = entry as Territory;
    const listed = members.get(territory.id) as Set<string>;
    for (const [memberIndex, member] of territory.members.entries()) {
      const path = `territories[${index}].members[${memberIndex}]`;
      const id = requireString(member, path);
      if (!claimed.has(id)) fail(path, `unknown node ${id}`);
      const claims = claimed.get(id);
      if (claims !== territory.id) fail(path, `node ${id} claims territory ${claims === null ? "null" : claims}`);
      if (listed.has(id)) fail(path, `node ${id} is listed twice`);
      listed.add(id);
    }
  }

  for (const [index, node] of (nodes as MapNode[]).entries()) {
    if (node.territory !== null && !members.get(node.territory)?.has(node.id)) {
      fail(`nodes[${index}].territory`, `territory ${node.territory} does not list ${node.id} among its members`);
    }
  }

  if (raw.edges !== undefined) {
    const seen = new Set<string>();
    for (const [index, entry] of requireArray(raw.edges, "edges").entries()) {
      const path = `edges[${index}]`;
      const edge = requireObject(entry, path);
      const source = requireString(edge.source, `${path}.source`);
      const target = requireString(edge.target, `${path}.target`);
      if (!claimed.has(source)) fail(`${path}.source`, `unknown node ${source}`);
      if (!claimed.has(target)) fail(`${path}.target`, `unknown node ${target}`);
      if (source === target) fail(path, "an edge joins two different nodes");
      const [low, high] = source < target ? [source, target] : [target, source];
      const key = JSON.stringify([low, high]);
      if (seen.has(key)) fail(path, `duplicate edge ${low}–${high}`);
      seen.add(key);
      const weight = edge.weight;
      if (weight !== undefined && (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0))
        fail(`${path}.weight`, `expected a finite number >= 0, got ${String(weight)}`);
      if (edge.reason !== undefined && (typeof edge.reason !== "string" || edge.reason.trim() === ""))
        fail(`${path}.reason`, "expected a non-empty string");
    }
  }

  return raw as unknown as MapSpec;
}
