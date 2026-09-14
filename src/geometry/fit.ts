import type { MapSpec } from "../spec";
import type { Viewport } from "../viewport";

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

export function fitSpec(spec: MapSpec, width: number, height: number, padding: number): Viewport {
  const b = worldBounds(spec);
  const usableW = Math.max(1, width - padding * 2);
  const usableH = Math.max(1, height - padding * 2);
  const scale = Math.min(usableW / (b.maxX - b.minX), usableH / (b.maxY - b.minY));
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return { scale, tx: width / 2 - cx * scale, ty: height / 2 - cy * scale };
}
