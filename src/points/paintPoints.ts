import { DIMMED_ALPHA, NO_DIMMED } from "../shared/dimmed";
import type { Scene } from "../shared/scene";
import type { MapNode, MapSpec } from "../shared/spec";
import type { PointMark, Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

/** Stroke width of an unvisited point's ring, in CSS pixels (spec slice D §4). */
export const UNVISITED_RING_WIDTH = 1.5;

/**
 * Each point in its territory's colour (`pointNeutral` without one), with
 * its state shown by shape, not by colour alone (WCAG 2.2 SC 1.4.1): a
 * visited point is a filled disc, any other a ring whose outer edge sits at
 * the same `pointRadius`, so both marks have the same footprint. A dimmed
 * territory's points are drawn first, underneath, at `alpha` times
 * `DIMMED_ALPHA`; the surface is left at `alpha`. A point with no territory
 * is never dimmed by its territory. With `matches`, a point it does not list
 * is dimmed the same way (spec search §2). Each pass draws its points of one kind and colour as one
 * batch (one path, one fill or stroke). Given the canvas `box`, a point
 * whose mark lies wholly outside it is skipped (spec mobile §7: at near a
 * phone frame would otherwise stroke every point of the corpus to show a
 * fifth of them).
 */
export function paintPoints(
  surface: Surface,
  scene: Scene,
  spec: MapSpec,
  viewport: Viewport,
  theme: Pick<Theme, "pointNeutral" | "pointRadius" | "unvisitedRingWidth">,
  dimmed: ReadonlySet<string> = NO_DIMMED,
  alpha = 1,
  box?: { width: number; height: number },
  matches?: ReadonlySet<string>,
): void {
  const reach = theme.pointRadius;
  // One batch per kind and colour, in first-seen order, so a pass costs one
  // path per colour instead of one per point.
  const drawPass = (include: (node: MapNode) => boolean) => {
    const batches = new Map<string, { visited: boolean; colour: string; marks: PointMark[] }>();
    for (const node of spec.nodes) {
      if (!include(node)) continue;
      const [horizontal, vertical] = toScreen(viewport, node.x, node.y);
      if (
        box !== undefined &&
        (horizontal < -reach || vertical < -reach || horizontal > box.width + reach || vertical > box.height + reach)
      )
        continue;
      const colour = (node.territory === null ? undefined : scene.colours.get(node.territory)) ?? theme.pointNeutral;
      const visited = node.state === "visited";
      const key = `${visited ? "fill" : "stroke"} ${colour}`;
      let batch = batches.get(key);
      if (batch === undefined) {
        batch = { visited, colour, marks: [] };
        batches.set(key, batch);
      }
      batch.marks.push({ id: node.id, horizontal, vertical });
    }
    for (const batch of batches.values()) {
      if (batch.visited) surface.fillCircles(batch.marks, theme.pointRadius, batch.colour);
      else {
        const ringWidth = theme.unvisitedRingWidth ?? UNVISITED_RING_WIDTH;
        // A ring wider than the point has no hole: clamp so the radius is never negative.
        surface.strokeCircles(batch.marks, Math.max(0, theme.pointRadius - ringWidth / 2), batch.colour, ringWidth);
      }
    }
  };
  // Dimmed by its territory, or by a search that does not list it.
  const isDimmed = (node: MapNode) =>
    (node.territory !== null && dimmed.has(node.territory)) || (matches !== undefined && !matches.has(node.id));
  if (dimmed.size > 0 || matches !== undefined) {
    surface.globalAlpha(alpha * DIMMED_ALPHA);
    drawPass(isDimmed);
    surface.globalAlpha(alpha);
  }
  drawPass((node) => !isDimmed(node));
}
