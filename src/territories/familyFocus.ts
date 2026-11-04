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
    weights.set(family, largest <= 0 ? 1 : smoothstep(options.focusFloor, options.focusFull, count / largest));
  }
  return weights;
}

/** A family's two levels from the frame's group alpha and its weight: its leaves' and its own. */
export function levelsOf(groupAlpha: number, weight: number): { leaf: number; family: number } {
  const leaf = (1 - groupAlpha) * weight;
  return { leaf, family: 1 - leaf };
}
