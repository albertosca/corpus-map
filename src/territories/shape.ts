export type Point = [number, number];
export type Ring = Point[];

const MAX_CELLS = 256;

/**
 * The `quantile` of the distances from each point to its nearest neighbour; 0
 * for fewer than two points. The boundary radius is set from the 90th
 * percentile, not the median: it must bridge a territory's sparse stretches,
 * or the outline breaks into islands (measured on the synthetic corpus: the
 * median split 18 of 30 territories, the 90th percentile none).
 */
export function spacing(points: readonly Point[], quantile = 0.9): number {
  if (points.length < 2) return 0;
  const cell = Math.max(1e-9, extent(points) / Math.sqrt(points.length));
  const grid = new Map<string, Point[]>();
  const keyOf = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
  for (const p of points) {
    const k = keyOf(p[0], p[1]);
    const bucket = grid.get(k);
    if (bucket) bucket.push(p);
    else grid.set(k, [p]);
  }
  const nearest = points.map((p) => {
    let best = Number.POSITIVE_INFINITY;
    for (let reach = 1; reach < 64 && !Number.isFinite(best); reach *= 2) {
      const gx = Math.floor(p[0] / cell);
      const gy = Math.floor(p[1] / cell);
      for (let dx = -reach; dx <= reach; dx += 1) {
        for (let dy = -reach; dy <= reach; dy += 1) {
          for (const q of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
            if (q === p) continue;
            const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
            if (d < best) best = d;
          }
        }
      }
    }
    return Number.isFinite(best) ? best : 0;
  });
  nearest.sort((a, b) => a - b);
  return nearest[Math.floor(quantile * (nearest.length - 1))] ?? 0;
}

export function extent(points: readonly Point[]): number {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return Math.max(maxX - minX, maxY - minY, 0);
}

/**
 * Outer rings of the union of disks of radius `r` around `points`, by
 * marching squares over the signed distance to the union. Holes are dropped:
 * a territory is drawn as regions, not as regions with gaps.
 */
export function disksOutline(points: readonly Point[], r: number): Ring[] {
  if (points.length === 0 || !(r > 0)) return [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  minX -= 2 * r;
  minY -= 2 * r;
  maxX += 2 * r;
  maxY += 2 * r;
  const cell = Math.max(r / 2, (maxX - minX) / MAX_CELLS, (maxY - minY) / MAX_CELLS);
  const nx = Math.ceil((maxX - minX) / cell) + 1;
  const ny = Math.ceil((maxY - minY) / cell) + 1;
  const field = new Float64Array(nx * ny).fill(Number.POSITIVE_INFINITY);
  const reach = r + 2 * cell;
  for (const [px, py] of points) {
    const i0 = Math.max(0, Math.floor((px - reach - minX) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((px + reach - minX) / cell));
    const j0 = Math.max(0, Math.floor((py - reach - minY) / cell));
    const j1 = Math.min(ny - 1, Math.ceil((py + reach - minY) / cell));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const d = Math.hypot(minX + i * cell - px, minY + j * cell - py) - r;
        const k = j * nx + i;
        if (d < (field[k] ?? Number.POSITIVE_INFINITY)) field[k] = d;
      }
    }
  }
  const f = (i: number, j: number): number => field[j * nx + i] ?? Number.POSITIVE_INFINITY;
  const crossing = (ax: number, ay: number, fa: number, bx: number, by: number, fb: number): Point => {
    const t = fa / (fa - fb);
    return [minX + (ax + (bx - ax) * t) * cell, minY + (ay + (by - ay) * t) * cell];
  };
  // Edge ids: horizontal edge from (i,j) to (i+1,j) is 2*(j*nx+i); vertical from (i,j) to (i,j+1) is 2*(j*nx+i)+1.
  const points_: Map<number, Point> = new Map();
  const links: Map<number, number[]> = new Map();
  const edgePoint = (id: number, i: number, j: number, horizontal: boolean): number => {
    if (!points_.has(id)) {
      points_.set(
        id,
        horizontal ? crossing(i, j, f(i, j), i + 1, j, f(i + 1, j)) : crossing(i, j, f(i, j), i, j + 1, f(i, j + 1)),
      );
    }
    return id;
  };
  const link = (a: number, b: number) => {
    const la = links.get(a);
    if (la) la.push(b);
    else links.set(a, [b]);
    const lb = links.get(b);
    if (lb) lb.push(a);
    else links.set(b, [a]);
  };
  for (let j = 0; j < ny - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const a = f(i, j) < 0 ? 1 : 0;
      const b = f(i + 1, j) < 0 ? 2 : 0;
      const c = f(i + 1, j + 1) < 0 ? 4 : 0;
      const d = f(i, j + 1) < 0 ? 8 : 0;
      const code = a | b | c | d;
      if (code === 0 || code === 15) continue;
      const e0 = () => edgePoint(2 * (j * nx + i), i, j, true);
      const e1 = () => edgePoint(2 * (j * nx + i + 1) + 1, i + 1, j, false);
      const e2 = () => edgePoint(2 * ((j + 1) * nx + i), i, j + 1, true);
      const e3 = () => edgePoint(2 * (j * nx + i) + 1, i, j, false);
      const centreInside = (f(i, j) + f(i + 1, j) + f(i + 1, j + 1) + f(i, j + 1)) / 4 < 0;
      switch (code) {
        case 1:
        case 14:
          link(e3(), e0());
          break;
        case 2:
        case 13:
          link(e0(), e1());
          break;
        case 3:
        case 12:
          link(e3(), e1());
          break;
        case 4:
        case 11:
          link(e1(), e2());
          break;
        case 6:
        case 9:
          link(e0(), e2());
          break;
        case 7:
        case 8:
          link(e3(), e2());
          break;
        case 5:
          if (centreInside) {
            link(e0(), e1());
            link(e2(), e3());
          } else {
            link(e3(), e0());
            link(e1(), e2());
          }
          break;
        case 10:
          if (centreInside) {
            link(e3(), e0());
            link(e1(), e2());
          } else {
            link(e0(), e1());
            link(e2(), e3());
          }
          break;
      }
    }
  }
  const rings: Ring[] = [];
  const seen = new Set<number>();
  for (const start of links.keys()) {
    if (seen.has(start)) continue;
    const ring: Ring = [];
    let prev = -1;
    let cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      const p = points_.get(cur);
      if (p) ring.push(p);
      const next = (links.get(cur) ?? []).find((n) => n !== prev && !seen.has(n));
      if (next === undefined) break;
      prev = cur;
      cur = next;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings
    .filter((ring, k) => !rings.some((other, m) => m !== k && contains(other, ring[0] as Point)))
    .map(chaikin)
    .map(chaikin);
}

/** One pass of Chaikin corner cutting on a closed ring. */
export function chaikin(ring: Ring): Ring {
  const out: Ring = [];
  for (let k = 0; k < ring.length; k += 1) {
    const p = ring[k] as Point;
    const q = ring[(k + 1) % ring.length] as Point;
    out.push(
      [0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]],
      [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]],
    );
  }
  return out;
}

/** Even-odd point-in-polygon test. */
export function contains(ring: Ring, [x, y]: Point): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i] as Point;
    const b = ring[j] as Point;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function ringArea(ring: Ring): number {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i] as Point;
    const b = ring[j] as Point;
    s += (b[0] + a[0]) * (b[1] - a[1]);
  }
  return Math.abs(s / 2);
}
