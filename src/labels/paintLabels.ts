import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

/** The canvas's CSS size; a name larger than it is never drawn. */
export interface LabelBox {
  width: number;
  height: number;
}

/**
 * Draws every placed name whose `activeFromScale` the viewport's current
 * scale has reached, except a name whose measured box is wider or taller
 * than the canvas: it could never be read whole anywhere on screen (a long
 * name on a phone-width view appears once the box is large enough).
 * Where a name sits never enters the decision, so pan and zoom cannot make
 * a name pop out: a name that fits slides off the edge, clipped by the
 * canvas, and a position-dependent skip would break map-feel metric 7.
 */
export function paintLabels(surface: Surface, scene: Scene, vp: Viewport, theme: Theme, box: LabelBox): void {
  for (const l of scene.labels) {
    if (vp.scale < l.activeFromScale) continue;
    if (l.width > box.width || l.height > box.height) continue;
    const [x, y] = toScreen(vp, l.anchor[0], l.anchor[1]);
    surface.text(l.name, x, y, theme.territoryLabel, theme.territoryFonts[l.labelClass]);
  }
}
