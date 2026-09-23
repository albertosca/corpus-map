import type { Point, Ring } from "../territories/shape";

function segmentDistance([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  let x = ax;
  let y = ay;
  let dx = bx - x;
  let dy = by - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = bx;
      y = by;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return Math.hypot(dx, dy);
}

/** Distance from `p` to the ring's outline, positive inside and negative outside. */
export function signedDistance(p: Point, ring: Ring): number {
  let inside = false;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i] as Point;
    const b = ring[j] as Point;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    best = Math.min(best, segmentDistance(p, a, b));
  }
  return inside ? best : -best;
}

interface Cell {
  x: number;
  y: number;
  h: number;
  d: number;
  max: number;
}

function cellAt(x: number, y: number, h: number, ring: Ring): Cell {
  const d = signedDistance([x, y], ring);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

/**
 * The interior point farthest from the outline (pole of inaccessibility), by
 * quadtree refinement: Garcia-Castellanos and Lombardo (2007), the idea behind
 * Mapbox's polylabel. `precision` is in world units.
 */
export function poleOfInaccessibility(ring: Ring, precision: number): Point {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const size = Math.min(maxX - minX, maxY - minY);
  if (!(size > 0)) return [(minX + maxX) / 2, (minY + maxY) / 2];
  const h0 = size / 2;
  const queue: Cell[] = [];
  for (let x = minX; x < maxX; x += size) {
    for (let y = minY; y < maxY; y += size) queue.push(cellAt(x + h0, y + h0, h0, ring));
  }
  let best = cellAt((minX + maxX) / 2, (minY + maxY) / 2, 0, ring);
  while (queue.length > 0) {
    queue.sort((a, b) => a.max - b.max);
    const cell = queue.pop() as Cell;
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    const h = cell.h / 2;
    queue.push(
      cellAt(cell.x - h, cell.y - h, h, ring),
      cellAt(cell.x + h, cell.y - h, h, ring),
      cellAt(cell.x - h, cell.y + h, h, ring),
      cellAt(cell.x + h, cell.y + h, h, ring),
    );
  }
  return [best.x, best.y];
}
