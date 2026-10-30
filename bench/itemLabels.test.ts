import { describe, expect, it } from "vitest";
import { generateCorpus } from "../fixtures/synthetic/generate";
import { DEFAULT_ITEM_LABEL_FONT, placeItemLabels } from "../src/labels/itemLabels";
import { estimateText } from "../src/labels/placement";
import { buildScene } from "../src/shared/scene";
import { DEFAULT_THEME } from "../src/shared/theme";
import { DEFAULT_TUNING } from "../src/shared/tuning";

// A stated target, not a measured figure: placement runs once per spec.
const BUDGET_MS = 1000;

describe("item label placement", () => {
  it(`places the 10,000-item synthetic corpus within ${BUDGET_MS}ms`, () => {
    const spec = generateCorpus({ seed: 1, size: 10_000 });
    const scene = buildScene(spec, DEFAULT_TUNING, DEFAULT_THEME, estimateText);
    const options = {
      font: DEFAULT_ITEM_LABEL_FONT,
      width: DEFAULT_TUNING.itemLabelWidth,
      lines: DEFAULT_TUNING.itemLabelLines,
    };
    const start = performance.now();
    const labels = placeItemLabels(spec, scene.labels, options, estimateText);
    const elapsed = performance.now() - start;
    console.log(`placeItemLabels: ${elapsed.toFixed(1)}ms for ${labels.length} labels`);
    expect(labels).toHaveLength(10_000);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
