import type { MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

export function paintLabels(surface: Surface, spec: MapSpec, vp: Viewport, theme: Theme): void {
  for (const t of spec.territories) {
    const [cx, cy] = toScreen(vp, t.centroid[0], t.centroid[1]);
    surface.text(t.name, cx, cy, theme.territoryLabel, theme.territoryFont);
  }
}
