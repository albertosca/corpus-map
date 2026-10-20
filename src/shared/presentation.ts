import type { Regime } from "../lod/lod";

/**
 * The two ways the map presents itself (spec slice D §4): `guided` for the
 * first look, `dense` for the analyst. Presentation never changes the LOD
 * regimes; it only changes emphasis.
 */
export type Presentation = "guided" | "dense";

/** In dense, territory fills are composited at this fraction of `theme.territoryFillAlpha`. */
export const DENSE_FILL_FACTOR = 0.5;

/**
 * In dense, medium and small territory names are drawn at this alpha. The
 * spec said 60%; at 0.6 the light theme reaches only 3.83:1, under metric
 * 16's 4.5:1, so 0.7 (5.09:1 light, 6.89:1 dark).
 */
export const DENSE_NAME_ALPHA = 0.7;

/** What the `presentation` prop accepts: a fixed presentation, or `"auto"` (the default). */
export type PresentationSetting = "auto" | Presentation;

/** `"auto"` is guided at the far regime and dense at mid and near; a fixed value ignores the regime. */
export function resolvePresentation(requested: PresentationSetting, regime: Regime): Presentation {
  if (requested !== "auto") return requested;
  return regime === "far" ? "guided" : "dense";
}
