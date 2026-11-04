export interface FocusOptions {
  /** A share of the largest family at or below which a family shows no leaves. */
  focusFloor: number;
  /** A share at or above which a family shows all its leaves. */
  focusFull: number;
}

function smoothstep(lower: number, upper: number, value: number): number {
  if (value <= lower) return 0;
  if (value >= upper) return 1;
  const position = (value - lower) / (upper - lower);
  return position * position * (3 - 2 * position);
}

/**
 * On-screen items of the largest family below which the shares are not trusted
 * (review I-1): with a handful of items one more or fewer moves a share by a
 * whole step, so the weight is blended toward 1 and is continuous per item.
 * The thousands of items seen at mid are untouched.
 */
const FOCUS_CONFIDENT_ITEMS = 24;

/**
 * Each family's weight in [0, 1] from how many items it has on screen (spec
 * family focus §2): the largest family is 1, the rest follow the smoothstep of
 * their share of it. Nothing on screen leaves every family at 1, which is the
 * map as it was drawn before this existed.
 */
export function familyFocus(counts: ReadonlyMap<string, number>, options: FocusOptions): ReadonlyMap<string, number> {
  let largest = 0;
  for (const count of counts.values()) if (count > largest) largest = count;
  const weights = new Map<string, number>();
  for (const [family, count] of counts) {
    if (largest <= 0) {
      weights.set(family, 1);
      continue;
    }
    const share = smoothstep(options.focusFloor, options.focusFull, count / largest);
    weights.set(family, share + (1 - share) * (1 - smoothstep(0, FOCUS_CONFIDENT_ITEMS, largest)));
  }
  return weights;
}

/** A family's two levels from the frame's group alpha and its weight: its leaves' and its own. */
export function levelsOf(groupAlpha: number, weight: number): { leaf: number; family: number } {
  // Written so that weight 1 gives exactly `groupAlpha` and weight 0 exactly 1 at group alpha 0: no rounding noise in the unfocused map.
  return { leaf: (1 - groupAlpha) * weight, family: groupAlpha + (1 - groupAlpha) * (1 - weight) };
}

/**
 * Whether a family's leaves are what the painted map names (review I-3): a
 * leaf name is drawn at half strength or more. Hover and the open territory
 * name what is painted (spec slice E §4), so they read this, not the zoom alone.
 */
export function namesLeaf(groupAlpha: number, weight: number): boolean {
  return levelsOf(groupAlpha, weight).leaf >= 0.5;
}
