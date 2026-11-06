import type { MapSpec } from "../shared/spec";
import { foldText } from "./localSearch";

/** What a rank function is shown of an item. */
export interface RankItem {
  id: string;
  label: string;
  meta?: unknown;
}

/** What a rank function can ask of the corpus besides the item. */
export interface RankContext {
  /** How many edges the item has (0 for an item without any, or an id the spec does not have). */
  connections: (id: string) => number;
}

/** "connections" (default): most edges first; "alphabetical": the label only; or a score, highest first. Ties are always alphabetical. */
export type RankRule = "connections" | "alphabetical" | ((item: RankItem, context: RankContext) => number);

/** A consumer's answer entry that carries its own relevance. */
export interface ScoredId {
  id: string;
  score: number;
}

interface Facts {
  items: Map<string, RankItem>;
  folded: Map<string, string>;
  connections: Map<string, number>;
}

const facts = new WeakMap<MapSpec, Facts>();

function factsOf(spec: MapSpec): Facts {
  const cached = facts.get(spec);
  if (cached) return cached;
  const items = new Map<string, RankItem>();
  const folded = new Map<string, string>();
  for (const node of spec.nodes) {
    items.set(
      node.id,
      node.meta === undefined
        ? { id: node.id, label: node.label }
        : { id: node.id, label: node.label, meta: node.meta },
    );
    folded.set(node.id, foldText(node.label));
  }
  const connections = new Map<string, number>();
  for (const edge of spec.edges ?? []) {
    if (edge.source === edge.target) continue;
    connections.set(edge.source, (connections.get(edge.source) ?? 0) + 1);
    connections.set(edge.target, (connections.get(edge.target) ?? 0) + 1);
  }
  const built = { items, folded, connections };
  facts.set(spec, built);
  return built;
}

/** The node's label, or the id itself for an id the spec does not have. */
export function labelOf(spec: MapSpec, id: string): string {
  return factsOf(spec).items.get(id)?.label ?? id;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function scoreOf(spec: MapSpec, id: string, rule: RankRule): number {
  const known = factsOf(spec);
  if (rule === "alphabetical") return 0;
  if (rule === "connections") return known.connections.get(id) ?? 0;
  const item = known.items.get(id) ?? { id, label: id };
  const value = rule(item, { connections: (other) => known.connections.get(other) ?? 0 });
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

/** Folded label, then id: the order of equals, so no answer depends on the order the ids arrived in. */
function tieBreak(spec: MapSpec, left: string, right: string): number {
  const known = factsOf(spec).folded;
  return (
    compareText(known.get(left) ?? foldText(left), known.get(right) ?? foldText(right)) || compareText(left, right)
  );
}

/** Highest first; two equal scores (including two -Infinity) compare as 0 rather than NaN. */
function byScoreDescending(left: number, right: number): number {
  if (left === right) return 0;
  return left < right ? 1 : -1;
}

/** Orders found ids best first by `rule`; ties by folded label, then id. */
export function orderLocal(spec: MapSpec, ids: readonly string[], rule: RankRule): string[] {
  const scores = new Map<string, number>();
  for (const id of ids) if (!scores.has(id)) scores.set(id, scoreOf(spec, id, rule));
  return [...scores.keys()].sort(
    (left, right) =>
      byScoreDescending(scores.get(left) as number, scores.get(right) as number) || tieBreak(spec, left, right),
  );
}

function isScored(entry: unknown): entry is ScoredId {
  return (
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as ScoredId).id === "string" &&
    typeof (entry as ScoredId).score === "number"
  );
}

/**
 * Orders a consumer's answer. Plain ids keep the order they came in (the back
 * end ranked them); `{ id, score }` entries sort by score descending, equal
 * scores by `rule`, then the tie-break. A repeated id keeps its first place.
 * Anything else (a mix, a missing score, a number) throws a `TypeError`.
 */
export function orderAnswer(spec: MapSpec, found: readonly (string | ScoredId)[], rule: RankRule): string[] {
  if (found.length === 0) return [];
  if (found.every((entry) => typeof entry === "string")) return [...new Set(found as readonly string[])];
  if (!found.every(isScored)) throw new TypeError("search answers must be all ids or all { id, score }");
  const scores = new Map<string, number>();
  for (const entry of found as readonly ScoredId[]) {
    if (!scores.has(entry.id)) {
      scores.set(entry.id, Number.isFinite(entry.score) ? entry.score : Number.NEGATIVE_INFINITY);
    }
  }
  return [...scores.keys()].sort(
    (left, right) =>
      byScoreDescending(scores.get(left) as number, scores.get(right) as number) ||
      byScoreDescending(scoreOf(spec, left, rule), scoreOf(spec, right, rule)) ||
      tieBreak(spec, left, right),
  );
}
