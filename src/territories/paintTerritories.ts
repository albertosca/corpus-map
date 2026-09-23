import type { MapNode, MapSpec } from "../shared/spec";
import type { Surface } from "../shared/surface";
import type { Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";
import { hullOf } from "./hull";

export function paintTerritories(
  surface: Surface,
  spec: MapSpec,
  vp: Viewport,
  byId: ReadonlyMap<string, MapNode>,
  theme: Theme,
): void {
  for (const t of spec.territories) {
    const pts = t.members
      .map((id) => byId.get(id))
      .filter((n) => n !== undefined)
      .map((n) => toScreen(vp, n.x, n.y));
    const ring = t.boundary ? t.boundary.map(([x, y]) => toScreen(vp, x, y)) : hullOf(pts);
    if (ring.length >= 3) surface.polygon(ring, theme.territoryFill, theme.territoryStroke);
  }
}
