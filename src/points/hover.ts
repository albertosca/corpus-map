export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

/** The point nearest to (x, y) within `radius` pixels, or null. Ties go to the earlier point. */
export function nearestWithin(
  points: readonly ScreenPoint[],
  x: number,
  y: number,
  radius: number,
): ScreenPoint | null {
  let best: ScreenPoint | null = null;
  let bestD = radius;
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD || (d === bestD && best === null)) {
      best = p;
      bestD = d;
    }
  }
  return best;
}
