/**
 * Every number the literature does not settle, in one place, so a tuning
 * panel can drive them without code changes. See the map-feel spec for the
 * source of each default.
 */
export interface Tuning {
  /** Scale factor per pixel of wheel `deltaY`: exp(-deltaY * wheelSensitivity). d3-zoom's default. */
  wheelSensitivity: number;
  /** Extra gain for trackpad pinch, which browsers deliver as a wheel event with `ctrlKey`. */
  pinchGain: number;
  /** Largest zoom factor a single wheel event may apply (MapLibre caps at 2). */
  maxZoomPerEvent: number;
  /** Fraction below a threshold the ratio must fall before a regime is left. */
  hysteresis: number;
  /** Fraction above a threshold over which the entering layer fades from 0 to 1. */
  fadeBand: number;
  /** Boundary disk radius, in units of the 90th percentile of a territory's nearest-neighbour distances. */
  hullPadding: number;
  /** Member-count percentiles at or above which a territory name is large or medium. */
  labelClasses: { large: number; medium: number };
  /** Screen-pixel radius within which hovering picks the nearest point (a 24 px target, WCAG 2.5.8). */
  hoverRadius: number;
}

export const DEFAULT_TUNING: Tuning = {
  wheelSensitivity: 0.002,
  pinchGain: 5,
  maxZoomPerEvent: 2,
  hysteresis: 0.05,
  fadeBand: 0.25,
  hullPadding: 2.5,
  labelClasses: { large: 0.8, medium: 0.4 },
  hoverRadius: 12,
};

function validateTuning(t: Tuning): void {
  if (!Number.isFinite(t.wheelSensitivity) || t.wheelSensitivity <= 0) {
    throw new RangeError(`tuning.wheelSensitivity must be a finite number > 0, got ${t.wheelSensitivity}`);
  }
  if (!Number.isFinite(t.pinchGain) || t.pinchGain <= 0) {
    throw new RangeError(`tuning.pinchGain must be a finite number > 0, got ${t.pinchGain}`);
  }
  if (!Number.isFinite(t.maxZoomPerEvent) || t.maxZoomPerEvent <= 1) {
    throw new RangeError(`tuning.maxZoomPerEvent must be a finite number > 1, got ${t.maxZoomPerEvent}`);
  }
  if (!Number.isFinite(t.hysteresis) || t.hysteresis < 0 || t.hysteresis >= 0.5) {
    throw new RangeError(`tuning.hysteresis must be a finite number >= 0 and < 0.5, got ${t.hysteresis}`);
  }
  if (!Number.isFinite(t.fadeBand) || t.fadeBand < 0) {
    throw new RangeError(`tuning.fadeBand must be a finite number >= 0, got ${t.fadeBand}`);
  }
  if (!Number.isFinite(t.hullPadding) || t.hullPadding <= 0) {
    throw new RangeError(`tuning.hullPadding must be a finite number > 0, got ${t.hullPadding}`);
  }
  if (!Number.isFinite(t.hoverRadius) || t.hoverRadius < 0) {
    throw new RangeError(`tuning.hoverRadius must be a finite number >= 0, got ${t.hoverRadius}`);
  }
  if (!Number.isFinite(t.labelClasses.large) || t.labelClasses.large < 0 || t.labelClasses.large > 1) {
    throw new RangeError(`tuning.labelClasses.large must be a finite number in [0, 1], got ${t.labelClasses.large}`);
  }
  if (!Number.isFinite(t.labelClasses.medium) || t.labelClasses.medium < 0 || t.labelClasses.medium > 1) {
    throw new RangeError(`tuning.labelClasses.medium must be a finite number in [0, 1], got ${t.labelClasses.medium}`);
  }
  if (t.labelClasses.medium > t.labelClasses.large) {
    throw new RangeError(
      `tuning.labelClasses.medium (${t.labelClasses.medium}) must be <= large (${t.labelClasses.large})`,
    );
  }
}

export function resolveTuning(partial: Partial<Tuning> | undefined): Tuning {
  const result = {
    ...DEFAULT_TUNING,
    ...partial,
    labelClasses: { ...DEFAULT_TUNING.labelClasses, ...partial?.labelClasses },
  };
  validateTuning(result);
  return result;
}
