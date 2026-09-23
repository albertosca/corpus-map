export type Regime = "far" | "mid" | "near";

export interface LodThresholds {
  midAt: number;
  nearAt: number;
}

/** Multiples of the fitted scale (the zoom at which the whole corpus fits): every corpus opens in the far regime. */
export const DEFAULT_THRESHOLDS: LodThresholds = { midAt: 2, nearAt: 6 };

/** The wheel zoom clamp (`CorpusMap`'s `MAX_ZOOM_IN`): a threshold above it can never be reached by zooming. */
const MAX_RATIO = 64;

function requireInRange(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > MAX_RATIO) {
    throw new RangeError(`thresholds.${field} must be a finite number in [0, ${MAX_RATIO}], got ${value}`);
  }
}

/**
 * Validated, defaulted thresholds: both fields finite and in
 * `[0, MAX_RATIO]`, `midAt <= nearAt`. Unvalidated thresholds silently break
 * the LOD contract — `{ midAt: 6, nearAt: -1 }` opens "near" immediately,
 * `{ midAt: NaN, nearAt: NaN }` sticks at "far" forever (`regimeAt` treats a
 * non-finite ratio as far, and a NaN threshold makes every comparison
 * false), and a `nearAt` above the wheel zoom clamp is unreachable no matter
 * how far the user zooms in.
 */
export function resolveThresholds(input: LodThresholds | undefined): LodThresholds {
  const t = input ?? DEFAULT_THRESHOLDS;
  requireInRange(t.midAt, "midAt");
  requireInRange(t.nearAt, "nearAt");
  if (t.midAt > t.nearAt) {
    throw new RangeError(`thresholds.midAt (${t.midAt}) must be <= thresholds.nearAt (${t.nearAt})`);
  }
  return t;
}
