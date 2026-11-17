import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

/** Clear space between the keyboard focus ring's outer edge and the selection ring. */
export const SELECTION_RING_GAP = 3;
export const SELECTION_RING_WIDTH = 2;
/** The selected dot is drawn this much larger than a plain point, so the one accent fill reads as a mark, not a recoloured point. */
export const SELECTED_DOT_GROWTH = 1;

/**
 * The selected item: its dot filled with the theme's one accent (the only
 * accent fill on the map), a gap, then a ring outside where the
 * keyboard focus ring sits, so the two differ by shape and position, not
 * only by colour (WCAG 2.2 SC 1.4.1; spec slice C §5). Drawn inside the
 * point layer, so it fades with the points and is absent at far.
 */
export function paintSelection(
  surface: Surface,
  scene: Scene,
  viewport: Viewport,
  theme: Pick<
    Theme,
    "pointRadius" | "focusOutlineWidth" | "selectionRing" | "territoryLabel" | "selectionRingWidth" | "tones"
  >,
  id: string,
): void {
  const node = scene.byId.get(id);
  if (!node) return;
  const ringWidth = theme.selectionRingWidth ?? SELECTION_RING_WIDTH;
  const [horizontal, vertical] = toScreen(viewport, node.x, node.y);
  surface.fillCircles([{ id, horizontal, vertical }], theme.pointRadius + SELECTED_DOT_GROWTH, theme.tones.accent);
  surface.ring(
    horizontal,
    vertical,
    theme.pointRadius + theme.focusOutlineWidth + SELECTION_RING_GAP + ringWidth / 2,
    theme.selectionRing ?? theme.territoryLabel,
    ringWidth,
  );
}
