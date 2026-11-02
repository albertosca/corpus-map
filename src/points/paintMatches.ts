import { NO_DIMMED } from "../shared/dimmed";
import type { Scene } from "../shared/scene";
import type { PointMark, Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";

/** Stroke width of a search match's ring, thinner than the selection ring so a selected match stays distinct. */
export const MATCH_RING_WIDTH = 1.5;
/** Clear space between a point's edge and a match's ring. */
export const MATCH_RING_GAP = 2.5;

/**
 * A ring round each matched item that is on screen (spec search §2), in the
 * selection colour. An id the scene does not know is ignored, and an item
 * whose ring lies wholly outside the box, or whose territory is dimmed (a
 * hidden item is not a result), is skipped.
 */
export function paintMatches(
  surface: Surface,
  scene: Scene,
  viewport: Viewport,
  theme: Pick<Theme, "pointRadius" | "selectionRing" | "territoryLabel">,
  matches: ReadonlySet<string>,
  box: { width: number; height: number },
  dimmed: ReadonlySet<string> = NO_DIMMED,
): void {
  const radius = theme.pointRadius + MATCH_RING_GAP;
  const reach = radius + MATCH_RING_WIDTH;
  const marks: PointMark[] = [];
  for (const id of matches) {
    const node = scene.byId.get(id);
    if (!node || (node.territory !== null && dimmed.has(node.territory))) continue;
    const [horizontal, vertical] = toScreen(viewport, node.x, node.y);
    if (horizontal < -reach || vertical < -reach || horizontal > box.width + reach || vertical > box.height + reach)
      continue;
    marks.push({ id, horizontal, vertical });
  }
  if (marks.length > 0)
    surface.strokeCircles(marks, radius, theme.selectionRing ?? theme.territoryLabel, MATCH_RING_WIDTH);
}
