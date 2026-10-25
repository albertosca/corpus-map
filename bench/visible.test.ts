import { describe, expect, it } from "vitest";
import arxiv from "../demo/corpora/arxiv.json";
import { withExpandedEdges } from "../demo/corpora/edges";
import { generateCorpus } from "../fixtures/synthetic/generate";
import { visibleNodes } from "../src/lod/visible";
import { validateSpec } from "../src/shared/spec";
import { fitSpec } from "../src/viewport/fit";

const SAMPLES = 15;

function medianOf(values: number[]): number {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (middle === undefined) throw new Error("median of an empty list");
  return middle;
}

describe("visibleNodes", () => {
  for (const [name, spec] of [
    ["arXiv 8,000", validateSpec(withExpandedEdges(arxiv))],
    ["synthetic 10,000", generateCorpus({ seed: 1, size: 10_000 })],
  ] as const) {
    it(`costs under 1 ms per pass on ${name} at the fitted 1280 x 800 view`, () => {
      const viewport = fitSpec(spec, 1280, 800, 24);
      for (let warmUp = 0; warmUp < 3; warmUp += 1) visibleNodes(spec, viewport, 1280, 800, Number.POSITIVE_INFINITY);
      const samples: number[] = [];
      for (let sample = 0; sample < SAMPLES; sample += 1) {
        const start = performance.now();
        visibleNodes(spec, viewport, 1280, 800, Number.POSITIVE_INFINITY);
        samples.push(performance.now() - start);
      }
      const median = medianOf(samples);
      console.log(`visibleNodes ${name}: median ${median.toFixed(3)} ms over ${SAMPLES}`);
      expect(median).toBeLessThan(1);
    });
  }
});
