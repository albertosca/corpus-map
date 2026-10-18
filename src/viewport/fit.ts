import type { MapSpec } from "../shared/spec";
import type { Viewport } from "./viewport";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const EMPTY: Bounds = { minX: 0, minY: 0, maxX: 1, maxY: 1 };

export function worldBounds(spec: MapSpec): Bounds {
  if (spec.nodes.length === 0) return { ...EMPTY };
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const node of spec.nodes) {
    if (node.x < left) left = node.x;
    if (node.y < top) top = node.y;
    if (node.x > right) right = node.x;
    if (node.y > bottom) bottom = node.y;
  }
  // A single point, or a perfectly flat axis, would give a zero-width box and
  // an infinite scale. Widen it instead of special-casing the caller.
  if (right - left < 1e-9) {
    left -= 0.5;
    right += 0.5;
  }
  if (bottom - top < 1e-9) {
    top -= 0.5;
    bottom += 0.5;
  }
  return { minX: left, minY: top, maxX: right, maxY: bottom };
}

/**
 * The padded-fit transform: `bounds` centred and scaled (one scale for both
 * axes) to fill a `width` x `height` box minus `padding` on every side.
 * Exported so a caller that already has a `Bounds` (the minimap's
 * `world`, not a `MapSpec` — `minimap/paintMinimap.ts`'s `minimapFit`) can
 * share this arithmetic instead of keeping a private copy of it (fix round
 * 1, finding 3). The `Math.max(1e-9, ...)` floor never changes `fitSpec`'s
 * own results — `worldBounds` already widens a degenerate box to at least 1
 * unit on each axis — but guards a caller that hands in a raw `Bounds` of
 * its own, not necessarily produced by `worldBounds`.
 */
export function fitBounds(bounds: Bounds, width: number, height: number, padding: number): Viewport {
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  const worldWidth = Math.max(1e-9, bounds.maxX - bounds.minX);
  const worldHeight = Math.max(1e-9, bounds.maxY - bounds.minY);
  const scale = Math.min(usableWidth / worldWidth, usableHeight / worldHeight);
  const centreHorizontal = (bounds.minX + bounds.maxX) / 2;
  const centreVertical = (bounds.minY + bounds.maxY) / 2;
  return { scale, tx: width / 2 - centreHorizontal * scale, ty: height / 2 - centreVertical * scale };
}

export function fitSpec(spec: MapSpec, width: number, height: number, padding: number): Viewport {
  return fitBounds(worldBounds(spec), width, height, padding);
}
