import type { Point, Ring } from "../territories/shape";

function segmentDistance(
  [pointHorizontal, pointVertical]: Point,
  [startHorizontal, startVertical]: Point,
  [endHorizontal, endVertical]: Point,
): number {
  let nearestHorizontal = startHorizontal;
  let nearestVertical = startVertical;
  let horizontalDelta = endHorizontal - nearestHorizontal;
  let verticalDelta = endVertical - nearestVertical;
  if (horizontalDelta !== 0 || verticalDelta !== 0) {
    const fraction =
      ((pointHorizontal - nearestHorizontal) * horizontalDelta + (pointVertical - nearestVertical) * verticalDelta) /
      (horizontalDelta * horizontalDelta + verticalDelta * verticalDelta);
    if (fraction > 1) {
      nearestHorizontal = endHorizontal;
      nearestVertical = endVertical;
    } else if (fraction > 0) {
      nearestHorizontal += horizontalDelta * fraction;
      nearestVertical += verticalDelta * fraction;
    }
  }
  horizontalDelta = pointHorizontal - nearestHorizontal;
  verticalDelta = pointVertical - nearestVertical;
  return Math.hypot(horizontalDelta, verticalDelta);
}

/** Distance from `point` to the ring's outline, positive inside and negative outside. */
export function signedDistance(point: Point, ring: Ring): number {
  let inside = false;
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index] as Point;
    const previous = ring[previousIndex] as Point;
    if (
      current[1] > point[1] !== previous[1] > point[1] &&
      point[0] < ((previous[0] - current[0]) * (point[1] - current[1])) / (previous[1] - current[1]) + current[0]
    )
      inside = !inside;
    best = Math.min(best, segmentDistance(point, current, previous));
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

function cellAt(horizontal: number, vertical: number, halfSize: number, ring: Ring): Cell {
  const distance = signedDistance([horizontal, vertical], ring);
  return { x: horizontal, y: vertical, h: halfSize, d: distance, max: distance + halfSize * Math.SQRT2 };
}

/**
 * The interior point farthest from the outline (pole of inaccessibility), by
 * quadtree refinement: Garcia-Castellanos and Lombardo (2007), the idea behind
 * Mapbox's polylabel. `precision` is in world units.
 */
export function poleOfInaccessibility(ring: Ring, precision: number): Point {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const [horizontal, vertical] of ring) {
    if (horizontal < left) left = horizontal;
    if (vertical < top) top = vertical;
    if (horizontal > right) right = horizontal;
    if (vertical > bottom) bottom = vertical;
  }
  const size = Math.min(right - left, bottom - top);
  if (!(size > 0)) return [(left + right) / 2, (top + bottom) / 2];
  const initialHalf = size / 2;
  const queue: Cell[] = [];
  for (let horizontal = left; horizontal < right; horizontal += size) {
    for (let vertical = top; vertical < bottom; vertical += size)
      queue.push(cellAt(horizontal + initialHalf, vertical + initialHalf, initialHalf, ring));
  }
  let best = cellAt((left + right) / 2, (top + bottom) / 2, 0, ring);
  while (queue.length > 0) {
    queue.sort((first, second) => first.max - second.max);
    const cell = queue.pop() as Cell;
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;
    const half = cell.h / 2;
    queue.push(
      cellAt(cell.x - half, cell.y - half, half, ring),
      cellAt(cell.x + half, cell.y - half, half, ring),
      cellAt(cell.x - half, cell.y + half, half, ring),
      cellAt(cell.x + half, cell.y + half, half, ring),
    );
  }
  return [best.x, best.y];
}
