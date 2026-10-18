export type Point = [number, number];
export type Ring = Point[];

const MAXIMUM_CELLS = 256;

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
  const keyOf = (horizontal: number, vertical: number) =>
    `${Math.floor(horizontal / cell)},${Math.floor(vertical / cell)}`;
  for (const point of points) {
    const key = keyOf(point[0], point[1]);
    const bucket = grid.get(key);
    if (bucket) bucket.push(point);
    else grid.set(key, [point]);
  }
  const nearest = points.map((point) => {
    let best = Number.POSITIVE_INFINITY;
    for (let reach = 1; reach < 64 && !Number.isFinite(best); reach *= 2) {
      const column = Math.floor(point[0] / cell);
      const row = Math.floor(point[1] / cell);
      for (let columnStep = -reach; columnStep <= reach; columnStep += 1) {
        for (let rowStep = -reach; rowStep <= reach; rowStep += 1) {
          for (const other of grid.get(`${column + columnStep},${row + rowStep}`) ?? []) {
            if (other === point) continue;
            const distance = Math.hypot(point[0] - other[0], point[1] - other[1]);
            if (distance < best) best = distance;
          }
        }
      }
    }
    return Number.isFinite(best) ? best : 0;
  });
  nearest.sort((first, second) => first - second);
  return nearest[Math.floor(quantile * (nearest.length - 1))] ?? 0;
}

export function extent(points: readonly Point[]): number {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const [horizontal, vertical] of points) {
    if (horizontal < left) left = horizontal;
    if (vertical < top) top = vertical;
    if (horizontal > right) right = horizontal;
    if (vertical > bottom) bottom = vertical;
  }
  return Math.max(right - left, bottom - top, 0);
}

/**
 * Outer rings of the union of disks of radius `radius` around `points`, by
 * marching squares over the signed distance to the union. Holes are dropped:
 * a territory is drawn as regions, not as regions with gaps.
 */
export function disksOutline(points: readonly Point[], radius: number): Ring[] {
  if (points.length === 0 || !(radius > 0)) return [];
  return components(points, 2 * radius).flatMap((group) => outlineGrid(group, radius));
}

/**
 * Groups of points whose disks of radius `link / 2` touch, by union-find over
 * a grid of cell `link`. Outlining each group on its own grid keeps one far
 * outlier from stretching a shared grid until a dense cluster falls between
 * its vertices and disappears.
 */
export function components(points: readonly Point[], link: number): Point[][] {
  const parent = points.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while ((parent[root] ?? root) !== root) root = parent[root] ?? root;
    let current = index;
    while (current !== root) {
      const next = parent[current] ?? root;
      parent[current] = root;
      current = next;
    }
    return root;
  };
  const grid = new Map<string, number[]>();
  points.forEach(([horizontal, vertical], index) => {
    const key = `${Math.floor(horizontal / link)},${Math.floor(vertical / link)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(index);
    else grid.set(key, [index]);
  });
  points.forEach(([horizontal, vertical], index) => {
    const column = Math.floor(horizontal / link);
    const row = Math.floor(vertical / link);
    for (let columnStep = -1; columnStep <= 1; columnStep += 1) {
      for (let rowStep = -1; rowStep <= 1; rowStep += 1) {
        for (const otherIndex of grid.get(`${column + columnStep},${row + rowStep}`) ?? []) {
          if (otherIndex <= index) continue;
          const other = points[otherIndex] as Point;
          if (Math.hypot(other[0] - horizontal, other[1] - vertical) <= link) parent[find(otherIndex)] = find(index);
        }
      }
    }
  });
  const groups = new Map<number, Point[]>();
  points.forEach((point, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(point);
    else groups.set(root, [point]);
  });
  return [...groups.values()];
}

function outlineGrid(points: readonly Point[], requestedRadius: number): Ring[] {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const [horizontal, vertical] of points) {
    if (horizontal < left) left = horizontal;
    if (vertical < top) top = vertical;
    if (horizontal > right) right = horizontal;
    if (vertical > bottom) bottom = vertical;
  }
  // Grid capped at about MAXIMUM_CELLS per side. If the cap makes cells coarser
  // than the disks, the disks grow to 1.5 cells: a coarse group dilates
  // instead of falling between grid vertices and vanishing.
  const coarse = Math.max(right - left, bottom - top) / (MAXIMUM_CELLS - 8);
  const radius = Math.max(requestedRadius, 1.5 * coarse);
  const cell = Math.max(requestedRadius / 2, coarse);
  left -= 2 * radius;
  top -= 2 * radius;
  right += 2 * radius;
  bottom += 2 * radius;
  const columns = Math.ceil((right - left) / cell) + 1;
  const rows = Math.ceil((bottom - top) / cell) + 1;
  const field = new Float64Array(columns * rows).fill(Number.POSITIVE_INFINITY);
  const reach = radius + 2 * cell;
  for (const [pointHorizontal, pointVertical] of points) {
    const firstColumn = Math.max(0, Math.floor((pointHorizontal - reach - left) / cell));
    const lastColumn = Math.min(columns - 1, Math.ceil((pointHorizontal + reach - left) / cell));
    const firstRow = Math.max(0, Math.floor((pointVertical - reach - top) / cell));
    const lastRow = Math.min(rows - 1, Math.ceil((pointVertical + reach - top) / cell));
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        const distance = Math.hypot(left + column * cell - pointHorizontal, top + row * cell - pointVertical) - radius;
        const slot = row * columns + column;
        if (distance < (field[slot] ?? Number.POSITIVE_INFINITY)) field[slot] = distance;
      }
    }
  }
  const sample = (column: number, row: number): number => field[row * columns + column] ?? Number.POSITIVE_INFINITY;
  const crossing = (
    fromColumn: number,
    fromRow: number,
    fromValue: number,
    toColumn: number,
    toRow: number,
    toValue: number,
  ): Point => {
    const fraction = fromValue / (fromValue - toValue);
    return [
      left + (fromColumn + (toColumn - fromColumn) * fraction) * cell,
      top + (fromRow + (toRow - fromRow) * fraction) * cell,
    ];
  };
  // Edge ids: horizontal edge from (column,row) to (column+1,row) is 2*(row*columns+column);
  // vertical from (column,row) to (column,row+1) is 2*(row*columns+column)+1.
  const edgePoints: Map<number, Point> = new Map();
  const links: Map<number, number[]> = new Map();
  const edgePoint = (id: number, column: number, row: number, horizontal: boolean): number => {
    if (!edgePoints.has(id)) {
      edgePoints.set(
        id,
        horizontal
          ? crossing(column, row, sample(column, row), column + 1, row, sample(column + 1, row))
          : crossing(column, row, sample(column, row), column, row + 1, sample(column, row + 1)),
      );
    }
    return id;
  };
  const link = (first: number, second: number) => {
    const firstLinks = links.get(first);
    if (firstLinks) firstLinks.push(second);
    else links.set(first, [second]);
    const secondLinks = links.get(second);
    if (secondLinks) secondLinks.push(first);
    else links.set(second, [first]);
  };
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const topLeft = sample(column, row) < 0 ? 1 : 0;
      const topRight = sample(column + 1, row) < 0 ? 2 : 0;
      const bottomRight = sample(column + 1, row + 1) < 0 ? 4 : 0;
      const bottomLeft = sample(column, row + 1) < 0 ? 8 : 0;
      const code = topLeft | topRight | bottomRight | bottomLeft;
      if (code === 0 || code === 15) continue;
      const topEdge = () => edgePoint(2 * (row * columns + column), column, row, true);
      const rightEdge = () => edgePoint(2 * (row * columns + column + 1) + 1, column + 1, row, false);
      const bottomEdge = () => edgePoint(2 * ((row + 1) * columns + column), column, row + 1, true);
      const leftEdge = () => edgePoint(2 * (row * columns + column) + 1, column, row, false);
      const centreInside =
        (sample(column, row) + sample(column + 1, row) + sample(column + 1, row + 1) + sample(column, row + 1)) / 4 < 0;
      switch (code) {
        case 1:
        case 14:
          link(leftEdge(), topEdge());
          break;
        case 2:
        case 13:
          link(topEdge(), rightEdge());
          break;
        case 3:
        case 12:
          link(leftEdge(), rightEdge());
          break;
        case 4:
        case 11:
          link(rightEdge(), bottomEdge());
          break;
        case 6:
        case 9:
          link(topEdge(), bottomEdge());
          break;
        case 7:
        case 8:
          link(leftEdge(), bottomEdge());
          break;
        case 5:
          if (centreInside) {
            link(topEdge(), rightEdge());
            link(bottomEdge(), leftEdge());
          } else {
            link(leftEdge(), topEdge());
            link(rightEdge(), bottomEdge());
          }
          break;
        case 10:
          if (centreInside) {
            link(leftEdge(), topEdge());
            link(rightEdge(), bottomEdge());
          } else {
            link(topEdge(), rightEdge());
            link(bottomEdge(), leftEdge());
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
    let previous = -1;
    let current = start;
    while (!seen.has(current)) {
      seen.add(current);
      const point = edgePoints.get(current);
      if (point) ring.push(point);
      const next = (links.get(current) ?? []).find((neighbour) => neighbour !== previous && !seen.has(neighbour));
      if (next === undefined) break;
      previous = current;
      current = next;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings
    .filter(
      (ring, ringIndex) =>
        !rings.some((other, otherIndex) => otherIndex !== ringIndex && contains(other, ring[0] as Point)),
    )
    .map(chaikin)
    .map(chaikin);
}

/** One pass of Chaikin corner cutting on a closed ring. */
export function chaikin(ring: Ring): Ring {
  const out: Ring = [];
  for (let index = 0; index < ring.length; index += 1) {
    const point = ring[index] as Point;
    const following = ring[(index + 1) % ring.length] as Point;
    out.push(
      [0.75 * point[0] + 0.25 * following[0], 0.75 * point[1] + 0.25 * following[1]],
      [0.25 * point[0] + 0.75 * following[0], 0.25 * point[1] + 0.75 * following[1]],
    );
  }
  return out;
}

/** Even-odd point-in-polygon test. */
export function contains(ring: Ring, [horizontal, vertical]: Point): boolean {
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index] as Point;
    const previous = ring[previousIndex] as Point;
    if (
      current[1] > vertical !== previous[1] > vertical &&
      horizontal < ((previous[0] - current[0]) * (vertical - current[1])) / (previous[1] - current[1]) + current[0]
    )
      inside = !inside;
  }
  return inside;
}

export function ringArea(ring: Ring): number {
  let twiceArea = 0;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index] as Point;
    const previous = ring[previousIndex] as Point;
    twiceArea += (previous[0] + current[0]) * (previous[1] - current[1]);
  }
  return Math.abs(twiceArea / 2);
}
