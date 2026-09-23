import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

/** Draws every placed name whose `activeFromScale` the viewport's current scale has reached. */
export function paintLabels(surface: Surface, scene: Scene, vp: Viewport, theme: Theme): void {
  for (const l of scene.labels) {
    if (vp.scale < l.activeFromScale) continue;
    const [x, y] = toScreen(vp, l.anchor[0], l.anchor[1]);
    surface.text(l.name, x, y, theme.territoryLabel, theme.territoryFonts[l.labelClass]);
  }
}
