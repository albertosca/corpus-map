import type { MapNode } from "../shared/spec";
import { boundsOf, fitClamped } from "./fit";
import type { Viewport } from "./viewport";

/** The part of the box a view may use: what `usableArea` returns. */
export interface FitArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The view that shows every node in `ids` inside `area`, padded and with the
 * scale clamped to [minimumScale, maximumScale] (spec search §3). Ids that are
 * not in `nodesById` are ignored; `null` when none resolves, so the caller
 * leaves the view alone.
 */
export function fitIds(
  nodesById: ReadonlyMap<string, MapNode>,
  ids: Iterable<string>,
  area: FitArea,
  padding: number,
  minimumScale: number,
  maximumScale: number,
): Viewport | null {
  const points: Array<readonly [number, number]> = [];
  for (const id of new Set(ids)) {
    const node = nodesById.get(id);
    if (node) points.push([node.x, node.y]);
  }
  if (points.length === 0) return null;
  const view = fitClamped(boundsOf(points), area.width, area.height, padding, minimumScale, maximumScale);
  return { ...view, tx: view.tx + area.left, ty: view.ty + area.top };
}
