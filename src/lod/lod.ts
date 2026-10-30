export type Regime = "far" | "mid" | "near";

export interface LodThresholds {
  midAt: number;
  nearAt: number;
}

/**
 * Multiples of the fitted scale (the zoom at which the whole corpus fits): every corpus opens in the far regime.
 * `nearAt` is metric 18's answer over the demo corpora: the earliest zoom at which item labels name nearly as
 * many on-screen items as they do at 6 (demo/corpora/labelledShare.ts, demo/corpora/nearAt.test.ts).
 */
export const DEFAULT_THRESHOLDS: LodThresholds = { midAt: 2, nearAt: 5 };

/** The wheel zoom clamp (`CorpusMap`'s `MAXIMUM_ZOOM_IN`): a threshold above it can never be reached by zooming. */
const MAXIMUM_RATIO = 64;

function requireInRange(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > MAXIMUM_RATIO) {
    throw new RangeError(`thresholds.${field} must be a finite number in [0, ${MAXIMUM_RATIO}], got ${value}`);
  }
}

/**
 * Validated, defaulted thresholds: both fields finite and in
 * `[0, MAXIMUM_RATIO]`, `midAt <= nearAt`. Unvalidated thresholds silently break
 * the LOD contract — `{ midAt: 6, nearAt: -1 }` opens "near" immediately,
 * `{ midAt: NaN, nearAt: NaN }` sticks at "far" forever (`regimeAt` treats a
 * non-finite ratio as far, and a NaN threshold makes every comparison
 * false), and a `nearAt` above the wheel zoom clamp is unreachable no matter
 * how far the user zooms in.
 */
export function resolveThresholds(input: LodThresholds | undefined): LodThresholds {
  const thresholds = input ?? DEFAULT_THRESHOLDS;
  requireInRange(thresholds.midAt, "midAt");
  requireInRange(thresholds.nearAt, "nearAt");
  if (thresholds.midAt > thresholds.nearAt) {
    throw new RangeError(`thresholds.midAt (${thresholds.midAt}) must be <= thresholds.nearAt (${thresholds.nearAt})`);
  }
  return thresholds;
}
