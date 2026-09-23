import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

export function paintTerritories(surface: Surface, scene: Scene, vp: Viewport, theme: Theme): void {
  for (const rings of scene.shapes.values()) {
    for (const ring of rings) {
      if (ring.length >= 3) {
        surface.polygon(
          ring.map(([x, y]) => toScreen(vp, x, y)),
          theme.territoryFill,
          theme.territoryStroke,
        );
      }
    }
  }
}
