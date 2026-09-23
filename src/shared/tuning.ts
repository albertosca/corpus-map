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

export function resolveTuning(partial: Partial<Tuning> | undefined): Tuning {
  return { ...DEFAULT_TUNING, ...partial, labelClasses: { ...DEFAULT_TUNING.labelClasses, ...partial?.labelClasses } };
}
