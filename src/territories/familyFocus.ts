import type { MapNode } from "../shared/spec";
import { toScreen, type Viewport } from "../viewport/viewport";

export interface FocusOptions {
  /** A share of the largest family at or below which a family shows no leaves. */
  focusFloor: number;
  /** A share at or above which a family shows all its leaves. */
  focusFull: number;
}

function smoothstep(lower: number, upper: number, value: number): number {
  if (value <= lower) return 0;
  if (value >= upper) return 1;
  const position = (value - lower) / (upper - lower);
  return position * position * (3 - 2 * position);
}

/**
 * On-screen items of the largest family below which the shares are not trusted
 * (review I-1): with few items a pan moves a share by a large step, so the
 * weight is blended toward 1 and is continuous per item. It scales with the
 * corpus, one item per CORPUS_ITEMS_PER_CONFIDENT_ITEM, between these two:
 * 24 held on the UMAP map and keeps a small corpus focused (the demo's 54
 * Chemical elements); corpus-cartographer's 8,000-paper map packs each family
 * into evenly filled disks with empty gaps between them, so at near a screen
 * holds a few dozen items and 96 is what keeps its weight jump under the near
 * guard (spec arxiv engine map). The thousands of items seen at mid are
 * untouched.
 */
const FOCUS_CONFIDENT_ITEMS_LEAST = 24;
const FOCUS_CONFIDENT_ITEMS = 96;
const CORPUS_ITEMS_PER_CONFIDENT_ITEM = 80;

/**
 * The share of the box, from each edge inward, over which an item's weight in
 * the focus count rises from 0 to 1 (spec arxiv engine map §2), so an item
 * crossing the edge moves its family's count continuously. On its own it does
 * not keep corpus-cartographer's map under the guards: a pan sweeps a dense
 * strip of one disk whatever the kernel, so the floor (`focusFloor` 0.25) and
 * FOCUS_CONFIDENT_ITEMS (96) do the rest. Measured on both arXiv maps: see the
 * continuity guards in demo/corpora/familyFocus.test.ts.
 */
export const FOCUS_FEATHER = 0.15;

/** 0 on the box edge or outside it, 1 from FOCUS_FEATHER of the box inward, smooth between. */
function edgeWeight(position: number): number {
  return smoothstep(0, FOCUS_FEATHER, Math.min(position, 1 - position));
}

/**
 * Each family's items on screen, each weighted by how far inside the box it
 * sits, so the count moves continuously while panning. Every family in
 * `families` is present, at 0 when it has nothing on screen. `nodes` may be
 * every node or only the visible ones (an item outside the box weighs 0), so
 * the map passes the list it already computed for the visible count.
 */
export function familyCounts(
  nodes: readonly MapNode[],
  viewport: Viewport,
  width: number,
  height: number,
  familyOfLeaf: ReadonlyMap<string, string>,
  families: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>(families.map((family) => [family, 0]));
  for (const node of nodes) {
    const family = node.territory === null ? undefined : familyOfLeaf.get(node.territory);
    if (family === undefined) continue;
    const [horizontal, vertical] = toScreen(viewport, node.x, node.y);
    const weight = edgeWeight(horizontal / width) * edgeWeight(vertical / height);
    if (weight > 0) counts.set(family, (counts.get(family) ?? 0) + weight);
  }
  return counts;
}

/** The step the focus key rounds each weight to (spec arxiv engine map §3). */
const FOCUS_KEY_STEP = 256;

/**
 * The weights as a string key, each rounded to 1/256: the soft-edged count
 * moves a weight a little on almost every pan frame, and a change no paint
 * would show should not rebuild the focus. Parse it with `JSON.parse` into
 * `[family, weight]` pairs.
 */
export function focusKeyOf(weights: ReadonlyMap<string, number>): string {
  return JSON.stringify(
    [...weights].map(([family, weight]) => [family, Math.round(weight * FOCUS_KEY_STEP) / FOCUS_KEY_STEP]),
  );
}

/**
 * Each family's weight in [0, 1] from how many items it has on screen (spec
 * family focus §2): the largest family is 1, the rest follow the smoothstep of
 * their share of it. Nothing on screen leaves every family at 1, which is the
 * map as it was drawn before this existed. `corpusItems` is the spec's item
 * count, which sets how many on-screen items the shares need to be trusted.
 */
export function familyFocus(
  counts: ReadonlyMap<string, number>,
  options: FocusOptions,
  corpusItems: number,
): ReadonlyMap<string, number> {
  const confident = Math.min(
    FOCUS_CONFIDENT_ITEMS,
    Math.max(FOCUS_CONFIDENT_ITEMS_LEAST, corpusItems / CORPUS_ITEMS_PER_CONFIDENT_ITEM),
  );
  let largest = 0;
  for (const count of counts.values()) if (count > largest) largest = count;
  const weights = new Map<string, number>();
  for (const [family, count] of counts) {
    if (largest <= 0) {
      weights.set(family, 1);
      continue;
    }
    const share = smoothstep(options.focusFloor, options.focusFull, count / largest);
    weights.set(family, share + (1 - share) * (1 - smoothstep(0, confident, largest)));
  }
  return weights;
}

/** A family's two levels from the frame's group alpha and its weight: its leaves' and its own. */
export function levelsOf(groupAlpha: number, weight: number): { leaf: number; family: number } {
  // Written so that weight 1 gives exactly `groupAlpha` and weight 0 exactly 1 at group alpha 0: no rounding noise in the unfocused map.
  return { leaf: (1 - groupAlpha) * weight, family: groupAlpha + (1 - groupAlpha) * (1 - weight) };
}

/**
 * Whether a family's leaves are what the painted map names (review I-3): a
 * leaf name is drawn at half strength or more. Hover and the open territory
 * name what is painted (spec slice E §4), so they read this, not the zoom alone.
 */
export function namesLeaf(groupAlpha: number, weight: number): boolean {
  return levelsOf(groupAlpha, weight).leaf >= 0.5;
}
