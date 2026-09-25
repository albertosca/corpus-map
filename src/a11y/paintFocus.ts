import type { Scene } from "../shared/scene";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

/**
 * The visible half of keyboard focus: the accessible tree's buttons are
 * visually hidden (the canvas is decorative, the tree is the content), so the
 * territory or item whose button has focus is marked on the canvas instead.
 */
export function paintFocusedTerritory(
  surface: Surface,
  scene: Scene,
  vp: Viewport,
  theme: Pick<Theme, "focusOutline" | "focusOutlineWidth">,
  id: string,
): void {
  for (const ring of scene.shapes.get(id) ?? []) {
    if (ring.length >= 3) {
      surface.outline(
        ring.map(([x, y]) => toScreen(vp, x, y)),
        theme.focusOutline,
        theme.focusOutlineWidth,
      );
    }
  }
}

/** A ring around the focused item's point, one outline width clear of the point itself. */
export function paintFocusedNode(
  surface: Surface,
  scene: Scene,
  vp: Viewport,
  theme: Pick<Theme, "focusOutline" | "focusOutlineWidth" | "pointRadius">,
  id: string,
): void {
  const node = scene.byId.get(id);
  if (!node) return;
  const [x, y] = toScreen(vp, node.x, node.y);
  surface.ring(x, y, theme.pointRadius + theme.focusOutlineWidth, theme.focusOutline, theme.focusOutlineWidth);
}
