import { hullOf } from "../geometry/hull";
import type { Regime } from "../lod";
import type { MapSpec } from "../spec";
import { toScreen, type Viewport } from "../viewport";
import type { Surface } from "./surface";

export interface Theme {
  territoryFill: string;
  territoryStroke: string;
  territoryLabel: string;
  territoryFont: string;
  visited: string;
  unvisited: string;
  pointRadius: number;
}

export const DEFAULT_THEME: Theme = {
  territoryFill: "rgba(120,120,140,0.10)",
  territoryStroke: "rgba(120,120,140,0.55)",
  territoryLabel: "rgba(40,40,50,0.90)",
  territoryFont: "600 14px system-ui, sans-serif",
  visited: "rgba(220,110,40,0.95)",
  unvisited: "rgba(140,140,150,0.35)",
  pointRadius: 3.5,
};

export function paint(surface: Surface, spec: MapSpec, vp: Viewport, regime: Regime, theme: Theme): void {
  surface.clear();

  const byId = new Map(spec.nodes.map((n) => [n.id, n]));

  for (const t of spec.territories) {
    const pts = t.members
      .map((id) => byId.get(id))
      .filter((n) => n !== undefined)
      .map((n) => toScreen(vp, n.x, n.y));
    const ring = t.boundary ? t.boundary.map(([x, y]) => toScreen(vp, x, y)) : hullOf(pts);
    if (ring.length >= 3) {
      surface.polygon(ring, theme.territoryFill, theme.territoryStroke);
    }
    const [cx, cy] = toScreen(vp, t.centroid[0], t.centroid[1]);
    surface.text(t.name, cx, cy, theme.territoryLabel, theme.territoryFont);
  }

  if (regime === "far") return;

  for (const n of spec.nodes) {
    const [x, y] = toScreen(vp, n.x, n.y);
    const fill = n.state === "visited" ? theme.visited : theme.unvisited;
    surface.circle(n.id, x, y, theme.pointRadius, fill);
  }
}
