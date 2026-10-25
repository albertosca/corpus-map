import type { Scene } from "../shared/scene";
import type { MapNode } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";
import type { RelatedEdge } from "./related";

/** The part of the segment inside [0, width] × [0, height], or null when it misses the box (Liang–Barsky). */
export function clipToBox(
  segmentStart: [number, number],
  segmentEnd: [number, number],
  width: number,
  height: number,
): [[number, number], [number, number]] | null {
  const deltaHorizontal = segmentEnd[0] - segmentStart[0];
  const deltaVertical = segmentEnd[1] - segmentStart[1];
  let start = 0;
  let end = 1;
  const sides: Array<[number, number]> = [
    [-deltaHorizontal, segmentStart[0]],
    [deltaHorizontal, width - segmentStart[0]],
    [-deltaVertical, segmentStart[1]],
    [deltaVertical, height - segmentStart[1]],
  ];
  for (const [direction, distance] of sides) {
    if (direction === 0) {
      if (distance < 0) return null;
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) start = Math.max(start, ratio);
    else end = Math.min(end, ratio);
    if (start > end) return null;
  }
  return [
    [segmentStart[0] + start * deltaHorizontal, segmentStart[1] + start * deltaVertical],
    [segmentStart[0] + end * deltaHorizontal, segmentStart[1] + end * deltaVertical],
  ];
}

/** Line width of the ring drawn around each related item. */
export const NEIGHBOUR_RING_WIDTH = 1.5;

/** The edges drawn for `id`: the first `cap` whose neighbour is not in a dimmed territory. Shared with the markers. */
export function drawnEdges(
  scene: Pick<Scene, "related" | "byId">,
  id: string,
  cap: number,
  dimmed: ReadonlySet<string>,
): RelatedEdge[] {
  const live = (scene.related.get(id) ?? []).filter((edge) => {
    const territory = scene.byId.get(edge.neighbour)?.territory ?? null;
    return territory === null || !dimmed.has(territory);
  });
  return live.slice(0, Math.max(0, cap));
}

/**
 * The related layer of item `id` (spec slice E §6): one line per drawn edge,
 * `1 + 2 × weight / heaviest` px wide (2 px without weights), clipped to the
 * canvas, then a ring around each neighbour. Drawn at `alpha`, then the
 * point layer's `restoreAlpha` is put back.
 */
export function paintEdges(
  surface: Surface,
  scene: Pick<Scene, "related" | "byId" | "maximumEdgeWeight">,
  viewport: Viewport,
  theme: Pick<Theme, "edge" | "pointRadius" | "focusOutlineWidth">,
  options: {
    id: string;
    width: number;
    height: number;
    cap: number;
    dimmed: ReadonlySet<string>;
    alpha: number;
    restoreAlpha: number;
  },
): void {
  const origin = scene.byId.get(options.id);
  if (!origin) return;
  const edges = drawnEdges(scene, options.id, options.cap, options.dimmed);
  if (edges.length === 0) return;
  const originPoint = toScreen(viewport, origin.x, origin.y);
  surface.globalAlpha(options.alpha);
  const ends: Array<[number, number]> = [];
  for (const edge of edges) {
    const neighbour = scene.byId.get(edge.neighbour) as MapNode;
    const neighbourPoint = toScreen(viewport, neighbour.x, neighbour.y);
    const clipped = clipToBox(originPoint, neighbourPoint, options.width, options.height);
    const lineWidth =
      edge.weight === undefined || scene.maximumEdgeWeight === 0 ? 2 : 1 + (2 * edge.weight) / scene.maximumEdgeWeight;
    if (clipped) surface.line(clipped[0], clipped[1], theme.edge, lineWidth);
    ends.push(neighbourPoint);
  }
  for (const [horizontal, vertical] of ends)
    surface.ring(
      horizontal,
      vertical,
      theme.pointRadius + theme.focusOutlineWidth / 2,
      theme.edge,
      NEIGHBOUR_RING_WIDTH,
    );
  surface.globalAlpha(options.restoreAlpha);
}
