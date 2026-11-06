/**
 * Pixels of the map's box that a consumer overlay covers on each side (a
 * drawer, a toolbar). Edge markers and `reveal` treat the rest as the usable
 * area, and so does the fit (`freeArea`), but only at a fit: an overlay opening
 * or closing alone never moves the view.
 */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const NO_INSETS: Insets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

const side = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

/** Every side a finite non-negative number; a missing, negative or non-finite side is 0. */
export function normaliseInsets(insets: Partial<Insets> | undefined): Insets {
  const top = side(insets?.top);
  const right = side(insets?.right);
  const bottom = side(insets?.bottom);
  const left = side(insets?.left);
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return NO_INSETS;
  return { top, right, bottom, left };
}

/** The part of a `width` x `height` box the insets leave uncovered, never of negative size. */
export function usableArea(
  width: number,
  height: number,
  insets: Insets,
): { left: number; top: number; width: number; height: number } {
  return {
    left: insets.left,
    top: insets.top,
    width: Math.max(0, width - insets.left - insets.right),
    height: Math.max(0, height - insets.top - insets.bottom),
  };
}

/** A free area under this many px on either axis is not worth fitting into: the fit keeps the whole box (spec fit-insets §4). */
export const MINIMUM_FREE_AREA = 120;

export type FreeArea = ReturnType<typeof usableArea>;

/** The area a fit should use, or `null` when the insets are all 0 or leave less than `MINIMUM_FREE_AREA` on an axis. */
export function freeArea(width: number, height: number, insets: Insets): FreeArea | null {
  if (insets === NO_INSETS) return null;
  const area = usableArea(width, height, insets);
  return area.width < MINIMUM_FREE_AREA || area.height < MINIMUM_FREE_AREA ? null : area;
}
