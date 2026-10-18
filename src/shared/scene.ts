import { type Measure, type PlacedLabel, placeLabels } from "../labels/placement";
import { poleOfInaccessibility } from "../labels/pole";
import { disksOutline, extent, type Point, type Ring, ringArea, spacing } from "../territories/shape";
import type { MapNode, MapSpec } from "./spec";
import type { Theme } from "./theme";
import type { Tuning } from "./tuning";

/** Everything about a corpus that does not change with the viewport: computed once per spec. */
export interface Scene {
  byId: ReadonlyMap<string, MapNode>;
  shapes: ReadonlyMap<string, Ring[]>;
  labels: readonly PlacedLabel[];
}

function largestRing(rings: readonly Ring[]): Ring | undefined {
  let best: Ring | undefined;
  for (const ring of rings) if (!best || ringArea(ring) > ringArea(best)) best = ring;
  return best;
}

/**
 * Only the fields this function actually reads, not the full `Tuning`/`Theme`
 * — so a caller can memoize its own call on just those primitive values
 * (e.g. `CorpusMap`, where `tuning`/`theme` objects are minted fresh on
 * every render for an inline literal prop) without depending on unstable
 * whole-object identity for fields it never uses.
 */
export function buildScene(
  spec: MapSpec,
  tuning: Pick<Tuning, "hullPadding" | "labelClasses">,
  theme: Pick<Theme, "territoryFonts">,
  measure: Measure,
): Scene {
  const byId = new Map(spec.nodes.map((node) => [node.id, node]));
  // Territories too small to measure their own spacing get disks 1% of the corpus wide.
  const fallback = 0.01 * Math.max(extent(spec.nodes.map((node) => [node.x, node.y] as Point)), 1e-9);
  const shapes = new Map<string, Ring[]>();
  const inputs = spec.territories.map((territory) => {
    const points = territory.members.flatMap((id) => {
      const node = byId.get(id);
      return node ? [[node.x, node.y] as Point] : [];
    });
    let rings: Ring[];
    if (territory.boundary) {
      rings = [territory.boundary.map(([horizontal, vertical]) => [horizontal, vertical] as Point)];
    } else {
      const memberSpacing = points.length >= 3 ? spacing(points, 0.9) : 0;
      // Too few members to measure spacing: overlap the disks so one or two
      // members still read as one region, never as separate dots.
      const radius = memberSpacing > 0 ? tuning.hullPadding * memberSpacing : Math.max(fallback, 0.6 * extent(points));
      rings = disksOutline(points, radius);
    }
    shapes.set(territory.id, rings);
    const ring = largestRing(rings);
    const anchor: Point =
      ring && ring.length >= 3
        ? poleOfInaccessibility(ring, extent(ring) * 0.01)
        : [territory.centroid[0], territory.centroid[1]];
    return { id: territory.id, name: territory.name, anchor, members: territory.members.length };
  });
  return { byId, shapes, labels: placeLabels(inputs, theme.territoryFonts, tuning.labelClasses, measure) };
}
