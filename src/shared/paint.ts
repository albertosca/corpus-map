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
 * point layer's fade, and the canvas's CSS size (a name whose box would
 * cross its edge is skipped, see `paintLabels`). No ratio here — a placed
 * name carries its own absolute `activeFromScale` (see
 * `labels/placement.ts`), so `paintLabels` reads `vp.scale` directly
 * instead of a fit-relative ratio threaded through the frame.
 */
export interface Frame {
  regime: Regime;
  pointAlpha: number;
  width: number;
  height: number;
}

/**
 * The single place that decides paint order: boundaries, then points, then
 * names, so a name is never covered by a mark or by a later territory's fill.
 */
export function paint(surface: Surface, scene: Scene, spec: MapSpec, vp: Viewport, frame: Frame, theme: Theme): void {
  surface.clear();
  paintTerritories(surface, scene, vp, theme);
  if (frame.regime !== "far" && frame.pointAlpha > 0) {
    surface.globalAlpha(frame.pointAlpha);
    paintPoints(surface, spec, vp, theme);
    surface.globalAlpha(1);
  }
  paintLabels(surface, scene, vp, theme, frame);
}
