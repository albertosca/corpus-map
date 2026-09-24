import type { MapSpec } from "corpus-map";
import { generateCorpus } from "../../fixtures/synthetic/generate";

/**
 * A synthetic corpus for scale testing (spec 4 §2): 5,000 items, seeded so
 * every visitor sees the same shapes. `fixtures/synthetic/generate.ts` lives
 * outside `src/` so it never ships in the library; the demo imports it
 * directly.
 */
export const syntheticSpec: MapSpec = generateCorpus({ seed: 1, size: 5000 });
