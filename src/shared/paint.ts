import { paintFocusedNode, paintFocusedTerritory } from "../a11y/paintFocus";
import { paintLabels } from "../labels/paintLabels";
import type { Regime } from "../lod/lod";
import { paintPoints } from "../points/paintPoints";
import { paintTerritories } from "../territories/paintTerritories";
import type { Viewport } from "../viewport/viewport";
import type { Scene } from "./scene";
import type { MapSpec } from "./spec";
import type { Surface } from "./surface";
import type { Theme } from "./theme";

/**
 * Per-frame values a precomputed `Scene` does not carry: the regime, the
 * point layer's fade, and the canvas's CSS size (a name larger than the
 * canvas is skipped, see `paintLabels`). No ratio here — a placed
 * name carries its own absolute `activeFromScale` (see
 * `labels/placement.ts`), so `paintLabels` reads `viewport.scale` directly
 * instead of a fit-relative ratio threaded through the frame.
 *
 * `focusedTerritory`/`focusedNode` are the ids (primitives, so they can sit
 * in an effect's dependency list) of the territory or item whose button in
 * the accessible tree has keyboard focus; absent or `null` means none.
 */
export interface Frame {
  regime: Regime;
  pointAlpha: number;
  width: number;
  height: number;
  focusedTerritory?: string | null | undefined;
  focusedNode?: string | null | undefined;
}

/**
 * The single place that decides paint order: the territory fill layer
 * (largest first), territory outlines, points, the keyboard-focus outline,
 * then names, so a name is never covered by a mark, by a territory's fill or
 * by the focus outline, and the focus outline is never covered by a
 * boundary or a point.
 */
export function paint(
  surface: Surface,
  scene: Scene,
  spec: MapSpec,
  viewport: Viewport,
  frame: Frame,
  theme: Theme,
): void {
  surface.clear();
  paintTerritories(surface, scene, viewport, theme, theme.territoryFillAlpha);
  if (frame.regime !== "far" && frame.pointAlpha > 0) {
    surface.globalAlpha(frame.pointAlpha);
    paintPoints(surface, scene, spec, viewport, theme);
    surface.globalAlpha(1);
  }
  if (typeof frame.focusedTerritory === "string")
    paintFocusedTerritory(surface, scene, viewport, theme, frame.focusedTerritory);
  if (typeof frame.focusedNode === "string") paintFocusedNode(surface, scene, viewport, theme, frame.focusedNode);
  paintLabels(surface, scene, viewport, theme, frame);
}
