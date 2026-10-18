import type { MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

export function paintPoints(surface: Surface, spec: MapSpec, viewport: Viewport, theme: Theme): void {
  for (const node of spec.nodes) {
    const [horizontal, vertical] = toScreen(viewport, node.x, node.y);
    const fill = node.state === "visited" ? theme.visited : theme.unvisited;
    surface.circle(node.id, horizontal, vertical, theme.pointRadius, fill);
  }
}
