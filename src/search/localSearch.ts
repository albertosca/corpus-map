import type { MapSpec } from "../shared/spec";
import { advance, finish, type Steps } from "../shared/steps";

/** What the local search matches against: each item's id and its folded label and `meta` text, in spec order. */
export interface SearchIndex {
  ids: readonly string[];
  texts: readonly string[];
}

/** Items indexed per step; a step yields after this many, so a large corpus indexes in slices. */
const ITEMS_PER_STEP = 100;
/** How deep into a nested `meta` the text is collected; deeper values are not searched. */
const META_DEPTH = 4;

/** Lower case with accents stripped: "Ação" and "acao" fold to the same text (spec search §4). */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

/** Appends the text of a `meta` value: strings and numbers, through arrays and objects; anything else (null, booleans, functions) adds nothing. */
function collectMeta(value: unknown, depth: number, seen: Set<object>, parts: string[]): void {
  if (typeof value === "string") parts.push(value);
  else if (typeof value === "number") parts.push(String(value));
  else if (typeof value === "object" && value !== null && depth < META_DEPTH && !seen.has(value)) {
    seen.add(value);
    for (const inner of Array.isArray(value) ? value : Object.values(value)) collectMeta(inner, depth + 1, seen, parts);
  }
}

/** Builds the index in steps of `ITEMS_PER_STEP` items, so the caller can hand the main thread back between them. */
export function* buildSearchIndex(spec: MapSpec): Steps<SearchIndex> {
  const ids: string[] = [];
  const texts: string[] = [];
  for (const [position, node] of spec.nodes.entries()) {
    if (position > 0 && position % ITEMS_PER_STEP === 0) yield;
    const parts = [node.label];
    collectMeta(node.meta, 0, new Set(), parts);
    ids.push(node.id);
    texts.push(foldText(parts.join(" ")));
  }
  return { ids, texts };
}

const indexes = new WeakMap<MapSpec, SearchIndex>();

/** The index of `spec`, built once per spec object. */
export function searchIndexOf(spec: MapSpec): SearchIndex {
  const cached = indexes.get(spec);
  if (cached) return cached;
  const index = finish(buildSearchIndex(spec));
  indexes.set(spec, index);
  return index;
}

/** Steps run per task while indexing in the background: 500 items, so a corpus of thousands never holds the main thread. */
const STEPS_PER_TASK = 5;
const pending = new WeakMap<MapSpec, Promise<SearchIndex>>();

/**
 * The index of `spec` built a few steps per task (spec search §4: no long
 * task while indexing), once per spec object; a finished index is shared with
 * `searchIndexOf`.
 */
export function searchIndexAsync(spec: MapSpec): Promise<SearchIndex> {
  const cached = indexes.get(spec);
  if (cached) return Promise.resolve(cached);
  const started = pending.get(spec);
  if (started) return started;
  const steps = buildSearchIndex(spec);
  const promise = new Promise<SearchIndex>((resolve, reject) => {
    const run = () => {
      try {
        const progress = advance(steps, STEPS_PER_TASK);
        if (progress.done) {
          indexes.set(spec, progress.value);
          resolve(progress.value);
        } else setTimeout(run, 0);
      } catch (failure) {
        reject(failure);
      }
    };
    run();
  });
  pending.set(spec, promise);
  // A failure is not cached, whichever task it came from: the next call starts over.
  promise.catch(() => pending.delete(spec));
  return promise;
}

/** Ids of the items whose label or `meta` contains every word of `query`, in spec order; no words, no ids. */
export function localSearch(index: SearchIndex, query: string): string[] {
  const words = foldText(query).split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [];
  const found: string[] = [];
  for (const [position, text] of index.texts.entries()) {
    if (words.every((word) => text.includes(word))) found.push(index.ids[position] as string);
  }
  return found;
}
