import { useMemo } from "react";
import type { MapSpec } from "../shared/spec";
import type { Steps } from "../shared/steps";
import { startSlices, useSliced } from "../shared/useSliced";
import { type ItemLabelOptions, type PlacedItemLabel, placingItemLabels } from "./itemLabels";
import type { Measure, PlacedLabel } from "./placement";

/**
 * Steps of item-label placement run in one slice: the first slice runs during
 * the render, where measuring is cold (400 steps took about 110 ms there for
 * the 8,000-item arXiv corpus at the 4× CPU slowdown spec mobile §7 measures
 * with), and later ones also stop at `SLICE_BUDGET_MILLISECONDS`. Counted in
 * steps, not time, so a corpus small enough for one slice is placed during
 * the render on every machine.
 */
export const ITEM_LABEL_STEPS_PER_SLICE = 100;

const NO_ITEM_LABELS: readonly PlacedItemLabel[] = [];

/**
 * The item labels of `spec`, placed by `placingItemLabels` through
 * `useSliced`: the first slice runs in the render, the rest in later tasks,
 * so a large corpus never holds the main thread in one long task (spec
 * mobile §7). Labels show at near only, so the wait is seldom seen. While a
 * placement is unfinished the corpus's last labels stand in, so a tuning
 * change does not blank them; a new corpus, or `spec` null (its scene still
 * building), shows none until its own are placed.
 */
export function useItemLabels(
  spec: MapSpec | null,
  seeds: readonly PlacedLabel[],
  options: ItemLabelOptions,
  measure: Measure,
): readonly PlacedItemLabel[] {
  const { font, width, lines } = options;
  const placement = useMemo(
    () => ({
      spec,
      ...startSlices(
        spec ? placingItemLabels(spec, seeds, { font, width, lines }, measure) : nothing(),
        ITEM_LABEL_STEPS_PER_SLICE,
      ),
    }),
    [spec, seeds, font, width, lines, measure],
  );
  const finished = useSliced(placement);
  if (!finished) return NO_ITEM_LABELS;
  return finished.sliced.spec === spec ? finished.value : NO_ITEM_LABELS;
}

/** No labels, in no steps. */
// biome-ignore lint/correctness/useYield: returns at once, so a null spec needs no special path in useSliced.
function* nothing(): Steps<PlacedItemLabel[]> {
  return [];
}
