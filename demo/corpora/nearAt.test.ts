import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "../../src/lod/lod";
import type { MapSpec } from "../../src/shared/spec";
import { cardSizeOf, LOADING_CARD_SIZE } from "../cards";
import arxivJson from "./arxiv.json";
import { constellationsSpec } from "./constellations";
import { resolveDisplay } from "./display";
import { elementsSpec } from "./elements";
import { arxivSpec, type CorpusId, gallery } from "./index";
import { chooseNearAt } from "./soloShare";
import { syntheticSpec } from "./synthetic";

const SPECS: Record<CorpusId, MapSpec> = {
  arxiv: arxivSpec(arxivJson),
  elements: elementsSpec,
  constellations: constellationsSpec,
  synthetic: syntheticSpec,
};

// Each case lays out cards for every territory at up to nine zoom ratios in
// two boxes; the arXiv corpus alone runs for seconds under suite load.
const MEASURE_TIMEOUT = 120_000;

describe("metric 18: cards arrive as early as they can without arriving more piled up", () => {
  it(
    "the library's nearAt is the earliest candidate that keeps every corpus's solo share at the library's card size",
    () => {
      expect(DEFAULT_THRESHOLDS.nearAt).toBe(chooseNearAt(Object.values(SPECS), () => LOADING_CARD_SIZE));
    },
    MEASURE_TIMEOUT,
  );

  it.each(gallery.map((entry) => entry.id))(
    "the %s entry's nearAt is the earliest candidate for its own corpus at its computed card size",
    (id) => {
      const entry = gallery.find((candidate) => candidate.id === id);
      const spec = SPECS[id];
      const computed = cardSizeOf(id, spec);
      const { nearAt } = resolveDisplay(entry?.display, computed).thresholds;
      expect(nearAt).toBe(chooseNearAt([spec], () => computed));
    },
    MEASURE_TIMEOUT,
  );
});
