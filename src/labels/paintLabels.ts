import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

/** The canvas's CSS size, which every drawn name must fit inside. */
export interface LabelBox {
  width: number;
  height: number;
}

/**
 * Draws every placed name whose `activeFromScale` the viewport's current
 * scale has reached and whose measured box lies whole inside the canvas.
 * A name that would cross the edge is skipped, not moved: skipping never
 * creates an overlap, and a name cut by the edge cannot be read anyway (a
 * long name on a phone-width fitted view appears once the user zooms in).
 */
export function paintLabels(surface: Surface, scene: Scene, vp: Viewport, theme: Theme, box: LabelBox): void {
  for (const l of scene.labels) {
    if (vp.scale < l.activeFromScale) continue;
    const [x, y] = toScreen(vp, l.anchor[0], l.anchor[1]);
    const halfW = l.width / 2;
    const halfH = l.height / 2;
    if (x - halfW < 0 || x + halfW > box.width || y - halfH < 0 || y + halfH > box.height) continue;
    surface.text(l.name, x, y, theme.territoryLabel, theme.territoryFonts[l.labelClass]);
  }
}
