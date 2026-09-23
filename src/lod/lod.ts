export type Regime = "far" | "mid" | "near";

export interface LodThresholds {
  midAt: number;
  nearAt: number;
}

/** Multiples of the fitted scale (the zoom at which the whole corpus fits): every corpus opens in the far regime. */
export const DEFAULT_THRESHOLDS: LodThresholds = { midAt: 2, nearAt: 6 };
