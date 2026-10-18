import type { MapNode, MapSpec } from "../shared/spec";
import { toScreen, type Viewport } from "../viewport/viewport";

/**
 * Nodes whose screen position falls inside the viewport, in spec order,
 * capped. The cap is a hard rule, not a heuristic: it is what keeps the DOM
 * bounded regardless of corpus size or how far out the user zooms with a
 * dense territory open. Applied after the on-screen filter, so it only ever
 * trims what the user could actually see, not an arbitrary prefix of the
 * spec. Above the cap, the canvas alone carries the field.
 */
export function visibleNodes(spec: MapSpec, viewport: Viewport, width: number, height: number, cap: number): MapNode[] {
  const onScreen: MapNode[] = [];
  for (const node of spec.nodes) {
    const [horizontal, vertical] = toScreen(viewport, node.x, node.y);
    if (horizontal >= 0 && horizontal <= width && vertical >= 0 && vertical <= height) onScreen.push(node);
  }
  return onScreen.slice(0, cap);
}
