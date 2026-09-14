type Point = [number, number];

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/**
 * Andrew's monotone chain. Sorting first is what makes the result independent
 * of input order, which the map depends on: the same members must always
 * produce the same boundary, or a recomputation silently redraws territories.
 */
export function hullOf(points: Point[]): Point[] {
  if (points.length < 3) return points.map((p) => [p[0], p[1]] as Point);

  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const deduped: Point[] = [];
  for (const p of sorted) {
    const last = deduped[deduped.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) deduped.push(p);
  }
  if (deduped.length < 3) return deduped;

  const build = (pts: Point[]): Point[] => {
    const chain: Point[] = [];
    for (const p of pts) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) chain.pop();
      chain.push(p);
    }
    chain.pop();
    return chain;
  };

  return [...build(deduped), ...build([...deduped].reverse())];
}
