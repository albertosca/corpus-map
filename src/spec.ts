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
}

export interface MapSpec {
  version: "1";
  territories: Territory[];
  nodes: MapNode[];
}

export class SpecError extends Error {}

function fail(path: string, detail: string): never {
  throw new SpecError(`${path}: ${detail}`);
}

function requireFinite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(path, `expected a finite number, got ${String(value)}`);
  return value;
}

export function validateSpec(input: unknown): MapSpec {
  const raw = input as MapSpec;
  if (raw?.version !== "1") fail("version", 'expected "1"');

  const territoryIds = new Set<string>();
  for (const [i, t] of raw.territories.entries()) {
    if (territoryIds.has(t.id)) fail(`territories[${i}].id`, `duplicate id ${t.id}`);
    territoryIds.add(t.id);
  }

  const nodeIds = new Set<string>();
  for (const [i, n] of raw.nodes.entries()) {
    if (nodeIds.has(n.id)) fail(`nodes[${i}].id`, `duplicate id ${n.id}`);
    nodeIds.add(n.id);
    requireFinite(n.x, `nodes[${i}].x`);
    requireFinite(n.y, `nodes[${i}].y`);
    if (n.territory !== null && !territoryIds.has(n.territory)) {
      fail(`nodes[${i}].territory`, `unknown territory ${n.territory}`);
    }
  }

  for (const [i, t] of raw.territories.entries()) {
    for (const [j, m] of t.members.entries()) {
      if (!nodeIds.has(m)) fail(`territories[${i}].members[${j}]`, `unknown node ${m}`);
    }
  }

  return raw;
}
