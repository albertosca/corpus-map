import type { MapSpec } from "corpus-map";
import { constellationsSpec } from "./constellations";
import { elementsSpec } from "./elements";

export interface GalleryEntry {
  id: "elements" | "constellations";
  label: string;
  spec: MapSpec;
}

/**
 * The gallery is the agnosticism proof: at least two corpora from unrelated
 * domains. The demo picker and the gallery test both read this one list.
 */
export const gallery: GalleryEntry[] = [
  { id: "elements", label: "Periodic Table", spec: elementsSpec },
  { id: "constellations", label: "Constellations", spec: constellationsSpec },
];
