import type { MapSpec } from "corpus-map";
import { validateSpec } from "corpus-map";
import { constellationsSpec } from "./constellations";
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

let loadedArxiv: MapSpec | undefined;

/**
 * `fetch`, not `import()`: a browser caches a failed dynamic import for the
 * life of the document, so after one network failure every retry rejected
 * without touching the network (B11). Only a success is kept in memory, as
 * the module cache used to keep it, so switching back to arXiv does not
 * download it again while a failure is always retried over the network.
 */
async function loadArxiv(): Promise<MapSpec> {
  if (loadedArxiv !== undefined) return loadedArxiv;
  const response = await fetch(arxivUrl);
  if (!response.ok) throw new Error(`arXiv corpus request failed: HTTP ${response.status}`);
  const body: unknown = await response.json();
  loadedArxiv = validateSpec(body);
  return loadedArxiv;
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
