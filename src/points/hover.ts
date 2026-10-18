export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

/** The point nearest to (horizontal, vertical) within `radius` pixels, or null. Ties go to the earlier point. */
export function nearestWithin(
  points: readonly ScreenPoint[],
  horizontal: number,
  vertical: number,
  radius: number,
): ScreenPoint | null {
  let best: ScreenPoint | null = null;
  let bestDistance = radius;
  for (const candidate of points) {
    const distance = Math.hypot(candidate.x - horizontal, candidate.y - vertical);
    if (distance < bestDistance || (distance === bestDistance && best === null)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
