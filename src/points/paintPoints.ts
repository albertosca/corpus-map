import type { Scene } from "../shared/scene";
import type { MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

/** Stroke width of an unvisited point's ring, in CSS pixels (spec slice D §4). */
export const UNVISITED_RING_WIDTH = 1.5;

/**
 * Each point in its territory's colour (`pointNeutral` without one), with
 * its state shown by shape, not by colour alone (WCAG 2.2 SC 1.4.1): a
 * visited point is a filled disc, any other a ring whose outer edge sits at
 * the same `pointRadius`, so both marks have the same footprint.
 */
export function paintPoints(
  surface: Surface,
  scene: Scene,
  spec: MapSpec,
  viewport: Viewport,
  theme: Pick<Theme, "pointNeutral" | "pointRadius">,
): void {
  for (const node of spec.nodes) {
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
  }
}
