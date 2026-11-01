import { compareIds } from "../shared/compareIds";
import type { MapNode } from "../shared/spec";

/** An arrow key's direction on the map; world coordinates share the screen's orientation (`y` grows downward). */
export type Direction = "left" | "right" | "up" | "down";

const AXES: Readonly<Record<Direction, readonly [number, number]>> = {
  right: [1, 0],
  left: [-1, 0],
  down: [0, 1],
  up: [0, -1],
};

/** How much more a step sideways costs than a step ahead (spec spatial keys §3). */
const ACROSS_WEIGHT = 2;

const better = (score: number, node: MapNode, bestScore: number, best: MapNode | null): boolean =>
  best === null || score < bestScore || (score === bestScore && compareIds(node.id, best.id) < 0);

/**
 * The item an arrow key moves the selection to (spec spatial keys §3): the
 * next or previous item of a stack at `from`'s exact point first, by id;
 * then the best score `along + 2 × across` inside the 45° cone, else in the
 * half-plane ahead; ties by id; null when nothing lies ahead.
 */
export function neighbourInDirection(from: MapNode, nodes: readonly MapNode[], direction: Direction): MapNode | null {
  const forward = direction === "right" || direction === "down";
  let stackNext: MapNode | null = null;
  for (const node of nodes) {
    if (node.id === from.id || node.x !== from.x || node.y !== from.y) continue;
    const order = compareIds(node.id, from.id);
    if (forward ? order <= 0 : order >= 0) continue;
    if (stackNext === null) stackNext = node;
    else {
      const againstBest = compareIds(node.id, stackNext.id);
      if (forward ? againstBest < 0 : againstBest > 0) stackNext = node;
    }
  }
  if (stackNext !== null) return stackNext;

  const [horizontal, vertical] = AXES[direction];
  let cone: MapNode | null = null;
  let coneScore = Number.POSITIVE_INFINITY;
  let plane: MapNode | null = null;
  let planeScore = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    if (node.id === from.id) continue;
    const offsetHorizontal = node.x - from.x;
    const offsetVertical = node.y - from.y;
    const along = offsetHorizontal * horizontal + offsetVertical * vertical;
    if (along <= 0) continue;
    const across = Math.abs(offsetHorizontal * vertical - offsetVertical * horizontal);
    const score = along + ACROSS_WEIGHT * across;
    if (across <= along && better(score, node, coneScore, cone)) {
      cone = node;
      coneScore = score;
    }
    if (better(score, node, planeScore, plane)) {
      plane = node;
      planeScore = score;
    }
  }
  return cone ?? plane;
}

/** The item nearest a world point, ties by id; where Enter starts the walk (spec spatial keys §4). */
export function nearestTo(nodes: readonly MapNode[], horizontal: number, vertical: number): MapNode | null {
  let best: MapNode | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const distance = Math.hypot(node.x - horizontal, node.y - vertical);
    if (better(distance, node, bestDistance, best)) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}
