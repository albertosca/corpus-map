import { paintLabels } from "../labels/paintLabels";
import type { Regime } from "../lod/lod";
import { paintPoints } from "../points/paintPoints";
import { paintTerritories } from "../territories/paintTerritories";
import type { Viewport } from "../viewport/viewport";
import type { MapSpec } from "./spec";
import type { Surface } from "./surface";
import type { Theme } from "./theme";

/**
 * The single place that decides paint order: boundaries, then points, then
 * names, so a name is never covered by a mark or by a later territory's fill.
 */
export function paint(surface: Surface, spec: MapSpec, vp: Viewport, regime: Regime, theme: Theme): void {
  surface.clear();
  const byId = new Map(spec.nodes.map((n) => [n.id, n]));
  paintTerritories(surface, spec, vp, byId, theme);
  if (regime !== "far") paintPoints(surface, spec, vp, theme);
  paintLabels(surface, spec, vp, theme);
}
