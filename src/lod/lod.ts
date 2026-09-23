export type Regime = "far" | "mid" | "near";

export interface LodThresholds {
  midAt: number;
  nearAt: number;
}

export const DEFAULT_THRESHOLDS: LodThresholds = { midAt: 2, nearAt: 8 };

export function regimeFor(scale: number, t: LodThresholds): Regime {
  if (!Number.isFinite(scale)) return "far";
  if (scale >= t.nearAt) return "near";
  if (scale >= t.midAt) return "mid";
  return "far";
}
