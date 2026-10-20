import { DIMMED_ALPHA, NO_DIMMED } from "../shared/dimmed";
import type { Scene } from "../shared/scene";
import type { MapNode, MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
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
 * is never dimmed.
 */
export function paintPoints(
  surface: Surface,
  scene: Scene,
  spec: MapSpec,
  viewport: Viewport,
  theme: Pick<Theme, "pointNeutral" | "pointRadius">,
  dimmed: ReadonlySet<string> = NO_DIMMED,
  alpha = 1,
): void {
  const draw = (node: MapNode) => {
    const [horizontal, vertical] = toScreen(viewport, node.x, node.y);
    const colour = (node.territory === null ? undefined : scene.colours.get(node.territory)) ?? theme.pointNeutral;
    if (node.state === "visited") surface.circle(node.id, horizontal, vertical, theme.pointRadius, colour);
    else
      surface.hollowCircle(
        node.id,
        horizontal,
        vertical,
        theme.pointRadius - UNVISITED_RING_WIDTH / 2,
        colour,
        UNVISITED_RING_WIDTH,
      );
  };
  const isDimmed = (node: MapNode) => node.territory !== null && dimmed.has(node.territory);
  if (dimmed.size > 0) {
    surface.globalAlpha(alpha * DIMMED_ALPHA);
    for (const node of spec.nodes) if (isDimmed(node)) draw(node);
    surface.globalAlpha(alpha);
  }
  for (const node of spec.nodes) if (!isDimmed(node)) draw(node);
}
