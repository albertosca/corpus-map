import { describe, expect, it } from "vitest";
import { generateCorpus } from "../fixtures/synthetic/generate";
import { type Direction, neighbourInDirection } from "../src/a11y/spatialNeighbour";

// A stated target, not a measured figure: one search per key press.
const BUDGET_MS = 2;
const DIRECTIONS: readonly Direction[] = ["left", "right", "up", "down"];

describe("spatial neighbour search", () => {
  it(`finds a neighbour among 10,000 items within ${BUDGET_MS}ms (median of 101)`, () => {
    const spec = generateCorpus({ seed: 1, size: 10_000 });
    const timings: number[] = [];
    for (let run = 0; run < 101; run += 1) {
      const from = spec.nodes[(run * 97) % spec.nodes.length];
      const direction = DIRECTIONS[run % DIRECTIONS.length];
      if (!from || !direction) throw new Error("expected a node and a direction");
      const start = performance.now();
      neighbourInDirection(from, spec.nodes, direction);
      timings.push(performance.now() - start);
    }
    timings.sort((first, second) => first - second);
    const median = timings[50] ?? Number.POSITIVE_INFINITY;
    console.log(`neighbourInDirection median: ${median.toFixed(3)}ms`);
    expect(median).toBeLessThan(BUDGET_MS);
  });
});
