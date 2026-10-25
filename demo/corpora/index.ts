import type { MapSpec } from "corpus-map";
import { validateSpec } from "corpus-map";
import { withGroupNames } from "../../tools/group-names/groupNamesFile";
import arxivGroupNames from "./arxiv.groups.json";
import { constellationsSpec } from "./constellations";
import { withExpandedEdges } from "./edges";
import { elementsSpec } from "./elements";
import { syntheticSpec } from "./synthetic";

export type CorpusId = "arxiv" | "elements" | "constellations" | "synthetic";

/**
 * arXiv is the only entry that loads lazily: its ~1.8 MB JSON must not block
 * the shell's first paint (spec 4 §2, Risks). Every other corpus is small
 * enough to ship in the main bundle and carries its `spec` synchronously.
 */
export type GalleryEntry =
  | { id: "arxiv"; label: string; load: () => Promise<MapSpec> }
  | { id: Exclude<CorpusId, "arxiv">; label: string; spec: MapSpec };

/**
 * Vite emits the JSON as an asset for this URL pattern, in dev and in the build.
 */
const arxivUrl = new URL("./arxiv.json", import.meta.url).href;

let pendingArxiv: Promise<MapSpec> | undefined;

/**
 * The arXiv body as the demo shows it: compact edges expanded, then the group
 * names Claude wrote (`arxiv.groups.json`, spec slice F §4) applied in place
 * of the provisional "Largest +N" ones. The tests build arXiv through this
 * too, so they check what the demo loads.
 */
export function arxivSpec(body: unknown): MapSpec {
  return validateSpec(withGroupNames(withExpandedEdges(body), arxivGroupNames));
}

async function fetchArxiv(): Promise<MapSpec> {
  const response = await fetch(arxivUrl);
  if (!response.ok) throw new Error(`arXiv corpus request failed: HTTP ${response.status}`);
  return arxivSpec(await response.json());
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
  { id: "arxiv", label: "Computer-science papers (arXiv metadata)", load: loadArxiv },
  { id: "elements", label: "Chemical elements", spec: elementsSpec },
  { id: "constellations", label: "Constellations", spec: constellationsSpec },
  { id: "synthetic", label: syntheticLabel(syntheticSpec.nodes.length), spec: syntheticSpec },
];
