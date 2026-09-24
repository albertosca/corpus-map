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
 * `import("./arxiv.json")`'s default export is typed off the ~1.8 MB literal
 * (8,000 nodes) unless widened immediately — the same reason
 * `arxiv.test.ts` types its static import as `unknown` before handing it to
 * `validateSpec`.
 */
async function loadArxiv(): Promise<MapSpec> {
  const module: unknown = await import("./arxiv.json");
  return validateSpec((module as { default: unknown }).default);
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
  { id: "synthetic", label: "Synthetic (5,000 items)", spec: syntheticSpec },
];
