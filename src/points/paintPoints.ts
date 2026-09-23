import type { MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

export function paintPoints(surface: Surface, spec: MapSpec, vp: Viewport, theme: Theme): void {
  for (const n of spec.nodes) {
    const [x, y] = toScreen(vp, n.x, n.y);
    const fill = n.state === "visited" ? theme.visited : theme.unvisited;
    surface.circle(n.id, x, y, theme.pointRadius, fill);
  }
}
