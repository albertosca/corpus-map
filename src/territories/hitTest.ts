import { compareIds } from "../shared/compareIds";
import type { Scene } from "../shared/scene";
import type { MapSpec } from "../shared/spec";
import type { Bounds } from "../viewport/fit";
import { toWorld, type Viewport } from "../viewport/viewport";
import { contains, type Point, type Ring } from "./shape";

/**
 * The non-dimmed territories whose shape holds `point` (world units), most
 * members first, ties by id (spec categories §7). The bounding box rejects
 * almost every territory before any ring is walked, which keeps a pointer
 * move cheap at hundreds of territories.
 */
export function territoriesAt(
  scene: Pick<Scene, "bounds" | "shapes">,
  spec: MapSpec,
  point: Point,
  dimmed: ReadonlySet<string>,
): string[] {
  const [horizontal, vertical] = point;
  return spec.territories
    .filter((territory) => {
      if (dimmed.has(territory.id)) return false;
      const box = scene.bounds.get(territory.id);
      if (!box || horizontal < box.minX || horizontal > box.maxX || vertical < box.minY || vertical > box.maxY)
        return false;
      // A box exists only for a territory with rings, so its shape is there too.
      return (scene.shapes.get(territory.id) as Ring[]).some((ring) => contains(ring, point));
    })
    .sort((first, second) => second.members.length - first.members.length || compareIds(first.id, second.id))
    .map((territory) => territory.id);
}

/**
 * The families whose region holds `point` (world units), skipping a family
 * whose every leaf is dimmed, most leaves first, ties by id (spec slice E §4).
 */
export function familiesAt(
  scene: Pick<Scene, "groups" | "groupShapes" | "groupBounds">,
  point: Point,
  dimmed: ReadonlySet<string>,
): string[] {
  const [horizontal, vertical] = point;
  return scene.groups
    .filter((group) => {
      if (group.members.every((member) => dimmed.has(member))) return false;
      const box = scene.groupBounds.get(group.id);
      if (!box || horizontal < box.minX || horizontal > box.maxX || vertical < box.minY || vertical > box.maxY)
        return false;
      return (scene.groupShapes.get(group.id) as Ring[]).some((ring) => contains(ring, point));
    })
    .sort((first, second) => second.members.length - first.members.length || compareIds(first.id, second.id))
    .map((group) => group.id);
}

/** Ids of the territories whose bounding box meets the view, sorted; dimmed ones included (the legend shows them). */
export function onScreenTerritories(
  bounds: ReadonlyMap<string, Bounds>,
  viewport: Viewport,
  width: number,
  height: number,
): string[] {
  const [left, top] = toWorld(viewport, 0, 0);
  const [right, bottom] = toWorld(viewport, width, height);
  const ids: string[] = [];
  for (const [id, box] of bounds)
    if (box.maxX >= left && box.minX <= right && box.maxY >= top && box.minY <= bottom) ids.push(id);
  return ids.sort();
}
