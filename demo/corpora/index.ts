import type { MapSpec } from "corpus-map";
import { validateSpec } from "corpus-map";
import { withExpandedArxiv } from "./compact";
import { constellationsSpec } from "./constellations";
import type { DisplaySettings } from "./display";
import { elementsSpec } from "./elements";
import { syntheticSpec } from "./synthetic";

export type CorpusId = "arxiv" | "elements" | "constellations" | "synthetic";

/**
 * arXiv is the only entry that loads lazily: its ~1.5 MB JSON must not block
 * the shell's first paint (spec 4 §2, Risks). Every other corpus is small
 * enough to ship in the main bundle and carries its `spec` synchronously.
 */
export type GalleryEntry =
  | { id: "arxiv"; label: string; load: () => Promise<MapSpec>; display?: DisplaySettings }
  | { id: Exclude<CorpusId, "arxiv">; label: string; spec: MapSpec; display?: DisplaySettings };

/**
 * Vite emits the JSON as an asset for this URL pattern, in dev and in the build.
 */
const arxivUrl = new URL("./arxiv.json", import.meta.url).href;

let pendingArxiv: Promise<MapSpec> | undefined;

/**
 * The arXiv body as the demo shows it: compact edges, territory members and
 * node meta expanded (`withExpandedArxiv`). Its territories are the map's own
 * clusters, leaves under declared families, named by the pipeline and held to
 * its blind test (`pipeline/arxiv`). The tests build arXiv through this too,
 * so they check what the demo loads.
 */
export function arxivSpec(body: unknown): MapSpec {
  return validateSpec(withExpandedArxiv(body));
}

/** Resolves in a later task, so the work before and after it runs as two tasks instead of one long one. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * `arxivSpec` split in two tasks: expanding and validating the 8,000-item
 * body in one task held the main thread 120 ms at the 4× CPU slowdown spec
 * mobile §7 measures with.
 */
async function fetchArxiv(): Promise<MapSpec> {
  const response = await fetch(arxivUrl);
  if (!response.ok) throw new Error(`arXiv corpus request failed: HTTP ${response.status}`);
  const expanded = withExpandedArxiv(await response.json());
  await nextTask();
  return validateSpec(expanded);
}

/**
 * `fetch`, not `import()`: a browser caches a failed dynamic import for the
 * life of the document, so after one network failure every retry rejected
 * without touching the network (B11). The load is kept as one promise, as the
 * module cache used to keep it: overlapping calls (StrictMode runs the demo's
 * effect twice in dev) share a single request, and switching back to arXiv
 * does not download it again. A failed load is dropped, so the next call goes
 * back to the network.
 */
function loadArxiv(): Promise<MapSpec> {
  if (pendingArxiv === undefined) {
    pendingArxiv = fetchArxiv();
    pendingArxiv.catch(() => {
      pendingArxiv = undefined;
    });
  }
  return pendingArxiv;
}

/** The synthetic corpus's picker label, e.g. "Synthetic (5,000 items)"; the demo passes the tuning panel's current size. */
export function syntheticLabel(size: number): string {
  return `Synthetic (${size.toLocaleString("en-US")} items)`;
}

/**
 * The gallery is the agnosticism proof: corpora from unrelated domains, plus
 * the real-world one and a synthetic one for scale testing. The demo picker
 * and the gallery test both read this one list.
 */
export const gallery: GalleryEntry[] = [
  // Each `nearAt` is metric 18's answer for that corpus: the earliest zoom at
  // which its item labels name nearly as many items as at 6
  // (demo/corpora/nearAt.test.ts); the test turns red when one goes stale.
  // 2.5 is the lowest candidate the metric tries, not a measured boundary:
  // arXiv might pass lower still.
  {
    id: "arxiv",
    label: "Computer-science papers (arXiv metadata)",
    load: loadArxiv,
    display: { thresholds: { nearAt: 2.5 } },
  },
  { id: "elements", label: "Chemical elements", spec: elementsSpec, display: { thresholds: { nearAt: 5 } } },
  { id: "constellations", label: "Constellations", spec: constellationsSpec, display: { thresholds: { nearAt: 3.5 } } },
  {
    id: "synthetic",
    label: syntheticLabel(syntheticSpec.nodes.length),
    spec: syntheticSpec,
    display: { thresholds: { nearAt: 4.5 } },
  },
];
