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
  let { minX, minY, maxX, maxY } = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  for (const n of spec.nodes) {
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  // A single point, or a perfectly flat axis, would give a zero-width box and
  // an infinite scale. Widen it instead of special-casing the caller.
  if (maxX - minX < 1e-9) {
    minX -= 0.5;
    maxX += 0.5;
  }
  if (maxY - minY < 1e-9) {
    minY -= 0.5;
    maxY += 0.5;
  }
  return { minX, minY, maxX, maxY };
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
  const usableW = Math.max(1, width - padding * 2);
  const usableH = Math.max(1, height - padding * 2);
  const w = Math.max(1e-9, bounds.maxX - bounds.minX);
  const h = Math.max(1e-9, bounds.maxY - bounds.minY);
  const scale = Math.min(usableW / w, usableH / h);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { scale, tx: width / 2 - cx * scale, ty: height / 2 - cy * scale };
}

export function fitSpec(spec: MapSpec, width: number, height: number, padding: number): Viewport {
  return fitBounds(worldBounds(spec), width, height, padding);
}
