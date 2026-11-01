import type { MapEdge, MapNode } from "corpus-map";

/** The reason an edge gets when the two titles share no meaningful word. */
export const REASON_FALLBACK = "similar abstract";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "via",
  "using",
  "towards",
  "toward",
  "use",
  "based",
  "are",
  "its",
  "our",
  "new",
  "not",
  "can",
  "how",
  "what",
  "when",
  "why",
  "does",
  "this",
  "that",
  "over",
  "under",
  "between",
  "through",
  "beyond",
  "learning",
  "model",
  "models",
]);

function terms(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/** Up to three words both titles use, stop words and words under three letters left out, in `first`'s order. */
export function sharedTitleTerms(first: string, second: string): string[] {
  return sharedTerms(terms(first), new Set(terms(second)));
}

function sharedTerms(first: readonly string[], second: ReadonlySet<string>): string[] {
  return [...new Set(first.filter((word) => second.has(word)))].slice(0, 3);
}

type CompactEdge = readonly [number, number, number];

/**
 * The arXiv corpus ships its edges as `[sourceIndex, targetIndex, weightPercent]`
 * (spec slice E §8); this turns them into `MapEdge`s, writing the reason from
 * the shared title words here rather than doubling the file with it.
 */
export function expandEdges(nodes: readonly MapNode[], compact: readonly CompactEdge[]): MapEdge[] {
  // Each title is split once, not once per edge (spec mobile §7: splitting per
  // edge was about 100 ms of the arXiv load at 4× CPU).
  const termLists = new Map<number, string[]>();
  const termSets = new Map<number, Set<string>>();
  const termsAt = (index: number) => {
    let list = termLists.get(index);
    if (!list) {
      list = terms((nodes[index] as MapNode).label);
      termLists.set(index, list);
    }
    return list;
  };
  const termSetAt = (index: number) => {
    let set = termSets.get(index);
    if (!set) {
      set = new Set(termsAt(index));
      termSets.set(index, set);
    }
    return set;
  };
  return compact.map(([sourceIndex, targetIndex, weightPercent]) => {
    const source = nodes[sourceIndex] as MapNode;
    const target = nodes[targetIndex] as MapNode;
    const shared = sharedTerms(termsAt(sourceIndex), termSetAt(targetIndex));
    return {
      source: source.id,
      target: target.id,
      weight: weightPercent / 100,
      reason: shared.length > 0 ? shared.join(", ") : REASON_FALLBACK,
    };
  });
}

function isNamedNode(node: unknown): boolean {
  if (typeof node !== "object" || node === null) return false;
  const { id, label } = node as { id?: unknown; label?: unknown };
  return typeof id === "string" && typeof label === "string";
}

function isCompactEdge(entry: unknown, nodeCount: number): entry is CompactEdge {
  return (
    Array.isArray(entry) &&
    entry.length === 3 &&
    entry.every((part) => Number.isInteger(part)) &&
    entry[0] >= 0 &&
    entry[0] < nodeCount &&
    entry[1] >= 0 &&
    entry[1] < nodeCount
  );
}

/**
 * `body` with compact edges expanded, before `validateSpec` sees it; any
 * other body — no edges, edges already objects, a compact entry that does
 * not resolve, or a node without a string id and label — comes back as it was, so `validateSpec` reports it.
 */
export function withExpandedEdges(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;
  const { nodes, edges } = body as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(nodes) || !Array.isArray(edges) || edges.length === 0) return body;
  if (!edges.every((entry) => isCompactEdge(entry, nodes.length))) return body;
  if (!nodes.every(isNamedNode)) return body;
  return { ...body, edges: expandEdges(nodes as MapNode[], edges as CompactEdge[]) };
}
