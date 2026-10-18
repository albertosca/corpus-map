import type { LodThresholds, Regime } from "./lod";

const ORDER: Record<Regime, number> = { far: 0, mid: 1, near: 2 };

/**
 * Regime for `ratio` = scale / fitted scale, with hysteresis: a finer regime
 * is entered at its threshold and left only once the ratio falls a fraction
 * `hysteresis` below it, so a zoom oscillating around a threshold does not
 * mount and unmount cards on every tick.
 */
export function regimeAt(rawRatio: number, thresholds: LodThresholds, previous: Regime, hysteresis: number): Regime {
  if (!Number.isFinite(rawRatio)) return "far";
  // `ratio` is scale / fitScale, and a scale built as fitScale * nearAt can
  // divide back to a float ulp below nearAt; a relative tolerance far below
  // anything a user can zoom to keeps it on the intended side.
  const ratio = rawRatio * (1 + 1e-9);
  const exit = 1 - hysteresis;
  const plain: Regime = ratio >= thresholds.nearAt ? "near" : ratio >= thresholds.midAt ? "mid" : "far";
  if (ORDER[plain] >= ORDER[previous]) return plain;
  if (previous === "near" && ratio >= thresholds.nearAt * exit) return "near";
  if (previous !== "far" && ratio >= thresholds.midAt * exit) return "mid";
  return plain;
}

/**
 * Opacity of a layer that enters at `threshold`: 0 at the threshold, 1 at
 * threshold * (1 + band), linear between. A threshold of 0 or less means the
 * layer is always fully present.
 */
export function fade(ratio: number, threshold: number, band: number): number {
  if (threshold <= 0 || band <= 0) return ratio >= threshold ? 1 : 0;
  const progress = (ratio - threshold) / (threshold * band);
  return Math.min(1, Math.max(0, progress));
}
