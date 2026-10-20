import { DIMMED_ALPHA, NO_DIMMED } from "../shared/dimmed";
import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

/** Territory outline width in CSS pixels (spec slice D §3). */
export const TERRITORY_OUTLINE_WIDTH = 1.5;

/**
 * Fills every territory opaque, largest first, into one layer composited at
 * `fillAlpha`, so each pixel shows the colour of the smallest territory
 * covering it and overlaps never darken; then outlines every ring in its
 * territory's full colour. A territory missing from `scene.colours` (an
 * empty palette) is painted in `theme.pointNeutral`. A dimmed territory's
 * fill and outline are drawn at `DIMMED_ALPHA`.
 */
export function paintTerritories(
  surface: Surface,
  scene: Scene,
  viewport: Viewport,
  theme: Pick<Theme, "pointNeutral">,
  fillAlpha: number,
  dimmed: ReadonlySet<string> = NO_DIMMED,
): void {
  // Projected once per frame: the fill layer and the outlines share these rings.
  const projected = scene.paintOrder.map((id) => ({
    colour: scene.colours.get(id) ?? theme.pointNeutral,
    isDimmed: dimmed.has(id),
    rings: (scene.shapes.get(id) ?? [])
      .filter((ring) => ring.length >= 3)
      .map((ring) => ring.map(([horizontal, vertical]) => toScreen(viewport, horizontal, vertical))),
  }));
  surface.layer(fillAlpha, (layer) => {
    let faded = false;
    for (const { colour, rings, isDimmed } of projected) {
      if (isDimmed !== faded) {
        layer.globalAlpha(isDimmed ? DIMMED_ALPHA : 1);
        faded = isDimmed;
      }
      for (const ring of rings) layer.polygon(ring, colour, "transparent");
    }
    if (faded) layer.globalAlpha(1);
  });
  let faded = false;
  for (const { colour, rings, isDimmed } of projected) {
    if (isDimmed !== faded) {
      surface.globalAlpha(isDimmed ? DIMMED_ALPHA : 1);
      faded = isDimmed;
    }
    for (const ring of rings) surface.outline(ring, colour, TERRITORY_OUTLINE_WIDTH);
  }
  if (faded) surface.globalAlpha(1);
}
