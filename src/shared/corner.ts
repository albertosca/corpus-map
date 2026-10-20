/** A corner of the map's box, where an overlay (minimap, legend) sits. */
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** Gap between a corner overlay and the box's edges, in CSS pixels. */
export const CORNER_MARGIN = 12;

/** Absolute-position offsets for each corner; plain numbers so this module stays free of React. */
export const CORNER_POSITION: Record<Corner, { top?: number; right?: number; bottom?: number; left?: number }> = {
  "top-left": { top: CORNER_MARGIN, left: CORNER_MARGIN },
  "top-right": { top: CORNER_MARGIN, right: CORNER_MARGIN },
  "bottom-left": { bottom: CORNER_MARGIN, left: CORNER_MARGIN },
  "bottom-right": { bottom: CORNER_MARGIN, right: CORNER_MARGIN },
};
