import type { Territory } from "../shared/spec";
import { type Ring, ringArea } from "./shape";

/** Cells along the longer side of the raster `visibleBorders` draws the shapes onto. */
export const COLOUR_GRID_CELLS = 256;

function compareIds(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function drawable(rings: readonly Ring[] | undefined): Ring[] {
  return (rings ?? []).filter((ring) => ring.length >= 3);
}

/** Territory ids by total ring area, largest first, ties by id: the fill layer's paint order. */
export function largestFirst(shapes: ReadonlyMap<string, readonly Ring[]>): string[] {
  const area = new Map<string, number>();
  for (const [id, rings] of shapes)
    area.set(
      id,
      drawable(rings).reduce((sum, ring) => sum + ringArea(ring), 0),
    );
  return [...shapes.keys()].sort(
    (first, second) => (area.get(second) ?? 0) - (area.get(first) ?? 0) || compareIds(first, second),
  );
}

export interface VisibleBorders {
  /** Raster cells where each territory is the one on top (the smallest territory covering the cell). */
  visibleCells: Map<string, number>;
  /** For each territory, the territories it shares a visible border with, and that border's length in cells. */
  neighbours: Map<string, Map<string, number>>;
}

/**
 * Rasterises the shapes in `order` (largest first) onto a grid of `cells`
 * along the longer side, so each cell ends up owned by the smallest
 * territory covering it — what the fill layer shows there. Two territories
 * are neighbours when owned cells of theirs touch side by side: a reader
 * sees that border, so the two need different colours. Overlap alone does
 * not count; on arXiv the overlap graph is too dense for any small palette.
 */
export function visibleBorders(
  shapes: ReadonlyMap<string, readonly Ring[]>,
  order: readonly string[],
  cells: number = COLOUR_GRID_CELLS,
): VisibleBorders {
  const visibleCells = new Map(order.map((id) => [id, 0]));
  const neighbours = new Map(order.map((id) => [id, new Map<string, number>()]));
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const id of order) {
    for (const ring of drawable(shapes.get(id))) {
      for (const [horizontal, vertical] of ring) {
        left = Math.min(left, horizontal);
        right = Math.max(right, horizontal);
        top = Math.min(top, vertical);
        bottom = Math.max(bottom, vertical);
      }
    }
  }
  const span = Math.max(right - left, bottom - top);
  if (!(span > 0)) return { visibleCells, neighbours };
  const cell = span / cells;
  const columns = Math.ceil((right - left) / cell) + 1;
  const rows = Math.ceil((bottom - top) / cell) + 1;
  const owner = new Int32Array(columns * rows).fill(-1);
  for (const [index, id] of order.entries()) {
    const rings = drawable(shapes.get(id));
    for (let row = 0; row < rows; row += 1) {
      const vertical = top + (row + 0.5) * cell;
      const crossings: number[] = [];
      for (const ring of rings) {
        for (let edge = 0; edge < ring.length; edge += 1) {
          const current = ring[edge] as readonly [number, number];
          const previous = ring[(edge + ring.length - 1) % ring.length] as readonly [number, number];
          if (current[1] > vertical !== previous[1] > vertical) {
            crossings.push(
              previous[0] + ((vertical - previous[1]) * (current[0] - previous[0])) / (current[1] - previous[1]),
            );
          }
        }
      }
      crossings.sort((first, second) => first - second);
      for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
        const firstColumn = Math.max(0, Math.ceil(((crossings[pair] as number) - left) / cell - 0.5));
        const lastColumn = Math.min(columns - 1, Math.floor(((crossings[pair + 1] as number) - left) / cell - 0.5));
        for (let column = firstColumn; column <= lastColumn; column += 1) owner[row * columns + column] = index;
      }
    }
  }
  const touch = (one: number, two: number) => {
    if (one < 0 || two < 0 || one === two) return;
    const first = order[one] as string;
    const second = order[two] as string;
    const firstNeighbours = neighbours.get(first) as Map<string, number>;
    const secondNeighbours = neighbours.get(second) as Map<string, number>;
    firstNeighbours.set(second, (firstNeighbours.get(second) ?? 0) + 1);
    secondNeighbours.set(first, (secondNeighbours.get(first) ?? 0) + 1);
  };
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const here = owner[row * columns + column] as number;
      if (here >= 0) {
        const id = order[here] as string;
        visibleCells.set(id, (visibleCells.get(id) ?? 0) + 1);
      }
      if (column + 1 < columns) touch(here, owner[row * columns + column + 1] as number);
      if (row + 1 < rows) touch(here, owner[(row + 1) * columns + column] as number);
    }
  }
  return { visibleCells, neighbours };
}

/**
 * One colour per territory. A colour given in the data is kept as is; the
 * rest are coloured greedily, most visible first (ties by id), each taking
 * the palette colour that shares the least visible border with its already
 * coloured neighbours (ties by palette order). A given colour weighs on its
 * neighbours only when it is one of the palette's own colours. With an empty
 * palette only the given colours are returned; painters fall back to
 * `theme.pointNeutral` for the rest. Never throws.
 */
export function assignTerritoryColours(
  shapes: ReadonlyMap<string, readonly Ring[]>,
  territories: readonly Territory[],
  palette: readonly string[],
): Map<string, string> {
  const colours = new Map<string, string>();
  for (const territory of territories) if (territory.colour !== undefined) colours.set(territory.id, territory.colour);
  if (palette.length === 0) return colours;
  const order = largestFirst(shapes);
  const { visibleCells, neighbours } = visibleBorders(shapes, order);
  const byVisibility = [...order].sort(
    (first, second) => (visibleCells.get(second) ?? 0) - (visibleCells.get(first) ?? 0) || compareIds(first, second),
  );
  for (const id of byVisibility) {
    if (colours.has(id)) continue;
    const cost = palette.map(() => 0);
    for (const [neighbour, length] of neighbours.get(id) ?? []) {
      const taken = colours.get(neighbour);
      const index = taken === undefined ? -1 : palette.indexOf(taken);
      if (index >= 0) cost[index] = (cost[index] ?? 0) + length;
    }
    let best = 0;
    for (const [index, value] of cost.entries()) if (value < (cost[best] ?? 0)) best = index;
    colours.set(id, palette[best] as string);
  }
  return colours;
}
