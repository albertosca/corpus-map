import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "../../src/lod/lod";
import type { MapSpec } from "../../src/shared/spec";
import { cardSizeOf } from "../cards";
import arxivJson from "./arxiv.json";
import { constellationsSpec } from "./constellations";
import { resolveDisplay } from "./display";
import { elementsSpec } from "./elements";
import { arxivSpec, type CorpusId, gallery } from "./index";
import { chooseNearAt } from "./labelledShare";
import { syntheticSpec } from "./synthetic";

const SPECS: Record<CorpusId, MapSpec> = {
  arxiv: arxivSpec(arxivJson),
  elements: elementsSpec,
  constellations: constellationsSpec,
  synthetic: syntheticSpec,
};

// Each case places item labels for every territory at up to nine zoom ratios
// in two boxes; the arXiv corpus alone runs for seconds under suite load.
const MEASURE_TIMEOUT = 120_000;

describe("metric 18: item labels arrive as early as they can while naming nearly as many items", () => {
  it(
    "the library's nearAt is the earliest candidate that keeps every corpus's labelled share",
    () => {
      expect(DEFAULT_THRESHOLDS.nearAt).toBe(chooseNearAt(Object.values(SPECS)));
    },
    MEASURE_TIMEOUT,
  );

  it.each(gallery.map((entry) => entry.id))(
    "the %s entry's nearAt is the earliest candidate for its own corpus",
    (id) => {
      const entry = gallery.find((candidate) => candidate.id === id);
      const spec = SPECS[id];
      const computed = cardSizeOf(id, spec);
      const { nearAt } = resolveDisplay(entry?.display, computed).thresholds;
      expect(nearAt).toBe(chooseNearAt([spec]));
    },
    MEASURE_TIMEOUT,
  );
});
