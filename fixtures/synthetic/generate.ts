import type { MapNode, MapSpec, Territory } from "../../src/shared/spec";

export const MIN_SIZE = 100;
export const TERRITORY_COUNT = 30;
const SPACING = 100;
const COLUMNS = 6;
const SYLLABLES = ["ka", "lo", "mi", "ren", "su", "tha", "vo", "ze", "qui", "dar", "nel", "pho", "bri", "sen", "tor"];

type Point = [number, number];
type Rand = () => number;

/** mulberry32: a 32-bit seeded PRNG, small and good enough for fixtures. */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: Rand): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function pick<T>(rand: Rand, items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error("pick from an empty list");
  return item;
}

/** A pronounceable name of exactly `length` characters, spaces never at an edge. */
function makeName(rand: Rand, length: number): string {
  let letters = "";
  while (letters.length < length) letters += pick(rand, SYLLABLES);
  const chars = letters.slice(0, length).split("");
  for (let i = 6; i < length - 3; i += 7 + Math.floor(rand() * 4)) chars[i] = " ";
  const name = chars.join("");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function cell(index: number): Point {
  return [(index % COLUMNS) * SPACING, Math.floor(index / COLUMNS) * SPACING];
}

function blob(rand: Rand, [cx, cy]: Point, sd: number, n: number): Point[] {
  return Array.from({ length: n }, () => [cx + gaussian(rand) * sd, cy + gaussian(rand) * sd] as Point);
}

/** Points along a polyline of equal-length segments, with a little jitter. */
function along(rand: Rand, segments: Array<[Point, Point]>, n: number): Point[] {
  return Array.from({ length: n }, () => {
    const s = rand() * segments.length;
    const seg = segments[Math.min(segments.length - 1, Math.floor(s))];
    if (!seg) throw new Error("no segment");
    const t = s - Math.floor(s);
    const [[x0, y0], [x1, y1]] = seg;
    return [x0 + (x1 - x0) * t + gaussian(rand) * 2, y0 + (y1 - y0) * t + gaussian(rand) * 2] as Point;
  });
}

function disk(rand: Rand, [cx, cy]: Point, radius: number, n: number): Point[] {
  return Array.from({ length: n }, () => {
    const r = radius * Math.sqrt(rand());
    const a = 2 * Math.PI * rand();
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Point;
  });
}

/** Heavy-tailed member counts for the ordinary territories, summing to `total`. */
function counts(total: number, k: number): number[] {
  const weights = Array.from({ length: k }, (_, i) => 1 / (i + 1) ** 1.1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.max(2, Math.floor((total * w) / sum)));
  const first = out[0];
  if (first === undefined) throw new Error("no territories");
  out[0] = first + total - out.reduce((a, b) => a + b, 0);
  if ((out[0] ?? 0) < 2) throw new RangeError(`cannot spread ${total} items over ${k} territories`);
  return out;
}

export function generateCorpus({ seed, size }: { seed: number; size: number }): MapSpec {
  if (!Number.isInteger(size) || size < MIN_SIZE) throw new RangeError(`size must be an integer >= ${MIN_SIZE}`);
  const rand = mulberry32(seed);
  const dense = Math.max(20, Math.round(size * 0.06));
  const loose = Math.max(2, Math.round(size * 0.02));
  // t0..t4 and t6..t29 share what is left; t5 is the dense cluster.
  const ordinary = counts(size - dense - loose, TERRITORY_COUNT - 1);
  const countFor = (i: number): number => {
    const c = i === 5 ? dense : ordinary[i < 5 ? i : i - 1];
    if (c === undefined) throw new Error(`no count for t${i}`);
    return c;
  };

  const lengths = [12, 14, 3, 40, 38, 10];
  // Hard cases share cells on purpose: t1/t2 (the L and what it wraps) in
  // cell 1, t3/t4 (adjacent long names) in cell 2. Ordinary ones follow.
  const HARD_CASE_CELLS = [0, 1, 1, 2, 2, 3];
  const pointsFor = (i: number, n: number): Point[] => {
    const [cx, cy] = cell(HARD_CASE_CELLS[i] ?? i - 2);
    switch (i) {
      case 0: // U: left arm, bottom, right arm
        return along(
          rand,
          [
            [
              [cx - 30, cy - 30],
              [cx - 30, cy + 30],
            ],
            [
              [cx - 30, cy + 30],
              [cx + 30, cy + 30],
            ],
            [
              [cx + 30, cy + 30],
              [cx + 30, cy - 30],
            ],
          ],
          n,
        );
      case 1: // L: left arm and bottom, wrapping t2
        return along(
          rand,
          [
            [
              [cx - 30, cy - 30],
              [cx - 30, cy + 30],
            ],
            [
              [cx - 30, cy + 30],
              [cx + 30, cy + 30],
            ],
          ],
          n,
        );
      case 2: // inside the L's convex hull, clear of both arms
        return blob(rand, [cell(1)[0] - 10, cell(1)[1] + 12], 3, n);
      case 3:
        return blob(rand, [cx - 12, cy], 5, n);
      case 4:
        return blob(rand, [cx + 12, cy], 5, n);
      case 5:
        return disk(rand, [cx, cy], 2, n);
      default:
        return blob(rand, [cx, cy], 6 + rand() * 8, n);
    }
  };

  const nodes: MapNode[] = [];
  const territories: Territory[] = [];
  for (let i = 0; i < TERRITORY_COUNT; i += 1) {
    const id = `t${i}`;
    const name = makeName(rand, lengths[i] ?? 4 + Math.floor(rand() * 20));
    const pts = pointsFor(i, countFor(i));
    const members: string[] = [];
    for (const [x, y] of pts) {
      const nodeId = `n${nodes.length}`;
      nodes.push({
        id: nodeId,
        label: `${name} ${members.length + 1}`,
        x,
        y,
        territory: id,
        state: rand() < 0.3 ? "visited" : "unvisited",
      });
      members.push(nodeId);
    }
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    territories.push({ id, name, members, centroid: [cx, cy] });
  }
  const bandY = Math.ceil(TERRITORY_COUNT / COLUMNS) * SPACING + 50;
  for (let i = 0; i < loose; i += 1) {
    nodes.push({
      id: `n${nodes.length}`,
      label: `Loose ${i + 1}`,
      x: rand() * COLUMNS * SPACING,
      y: bandY + gaussian(rand) * 10,
      territory: null,
    });
  }
  return { version: "1", territories, nodes };
}
