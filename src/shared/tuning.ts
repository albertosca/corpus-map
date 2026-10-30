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
  /**
   * Below this zoom ratio (viewport scale over fit scale) the far map names
   * groups, not territories; the swap cross-fades over `fadeBand` above it
   * (spec categories §4), squeezed to finish before far can end
   * (`groupNameAlpha`). With no room before `midAt`, group names hold
   * through all of far.
   */
  groupNamesUntil: number;
  /** How many related items the selected or hovered item draws a line to, heaviest first (spec slice E §6); 0 draws none. */
  edgesPerNode: number;
  /** Widest an item label's text may run at near, in screen pixels, before it wraps (spec item labels §2). */
  itemLabelWidth: number;
  /** Most lines an item label wraps to; text past the last ends in an ellipsis. */
  itemLabelLines: number;
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
  groupNamesUntil: 1.4,
  edgesPerNode: 3,
  itemLabelWidth: 160,
  itemLabelLines: 3,
};

function validateTuning(tuning: Tuning): void {
  if (!Number.isFinite(tuning.wheelSensitivity) || tuning.wheelSensitivity <= 0) {
    throw new RangeError(`tuning.wheelSensitivity must be a finite number > 0, got ${tuning.wheelSensitivity}`);
  }
  if (!Number.isFinite(tuning.pinchGain) || tuning.pinchGain <= 0) {
    throw new RangeError(`tuning.pinchGain must be a finite number > 0, got ${tuning.pinchGain}`);
  }
  if (!Number.isFinite(tuning.maxZoomPerEvent) || tuning.maxZoomPerEvent <= 1) {
    throw new RangeError(`tuning.maxZoomPerEvent must be a finite number > 1, got ${tuning.maxZoomPerEvent}`);
  }
  if (!Number.isFinite(tuning.hysteresis) || tuning.hysteresis < 0 || tuning.hysteresis >= 0.5) {
    throw new RangeError(`tuning.hysteresis must be a finite number >= 0 and < 0.5, got ${tuning.hysteresis}`);
  }
  if (!Number.isFinite(tuning.fadeBand) || tuning.fadeBand < 0) {
    throw new RangeError(`tuning.fadeBand must be a finite number >= 0, got ${tuning.fadeBand}`);
  }
  if (!Number.isFinite(tuning.groupNamesUntil) || tuning.groupNamesUntil < 1) {
    throw new RangeError(`tuning.groupNamesUntil must be a finite number >= 1, got ${tuning.groupNamesUntil}`);
  }
  if (!Number.isFinite(tuning.hullPadding) || tuning.hullPadding <= 0) {
    throw new RangeError(`tuning.hullPadding must be a finite number > 0, got ${tuning.hullPadding}`);
  }
  if (!Number.isFinite(tuning.hoverRadius) || tuning.hoverRadius < 0) {
    throw new RangeError(`tuning.hoverRadius must be a finite number >= 0, got ${tuning.hoverRadius}`);
  }
  if (!Number.isFinite(tuning.labelClasses.large) || tuning.labelClasses.large < 0 || tuning.labelClasses.large > 1) {
    throw new RangeError(
      `tuning.labelClasses.large must be a finite number in [0, 1], got ${tuning.labelClasses.large}`,
    );
  }
  if (
    !Number.isFinite(tuning.labelClasses.medium) ||
    tuning.labelClasses.medium < 0 ||
    tuning.labelClasses.medium > 1
  ) {
    throw new RangeError(
      `tuning.labelClasses.medium must be a finite number in [0, 1], got ${tuning.labelClasses.medium}`,
    );
  }
  if (!Number.isInteger(tuning.edgesPerNode) || tuning.edgesPerNode < 0) {
    throw new RangeError(`tuning.edgesPerNode must be an integer >= 0, got ${tuning.edgesPerNode}`);
  }
  if (!Number.isFinite(tuning.itemLabelWidth) || tuning.itemLabelWidth <= 0) {
    throw new RangeError(`tuning.itemLabelWidth must be a finite number > 0, got ${tuning.itemLabelWidth}`);
  }
  if (!Number.isInteger(tuning.itemLabelLines) || tuning.itemLabelLines < 1) {
    throw new RangeError(`tuning.itemLabelLines must be an integer >= 1, got ${tuning.itemLabelLines}`);
  }
  if (tuning.labelClasses.medium > tuning.labelClasses.large) {
    throw new RangeError(
      `tuning.labelClasses.medium (${tuning.labelClasses.medium}) must be <= large (${tuning.labelClasses.large})`,
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
