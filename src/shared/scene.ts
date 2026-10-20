import { type Measure, type PlacedLabel, placeLabels } from "../labels/placement";
import { poleOfInaccessibility } from "../labels/pole";
import { assignTerritoryColours, largestFirst } from "../territories/colour";
import { deriveTerritoryGroups, type TerritoryGroup } from "../territories/groups";
import { contains, disksOutline, extent, type Point, type Ring, ringArea, spacing } from "../territories/shape";
import { type Bounds, ringBounds } from "../viewport/fit";
import type { MapNode, MapSpec, Territory } from "./spec";
import type { Theme } from "./theme";
import type { Tuning } from "./tuning";

/** Everything about a corpus that does not change with the viewport: computed once per spec. */
export interface Scene {
  byId: ReadonlyMap<string, MapNode>;
  shapes: ReadonlyMap<string, Ring[]>;
  labels: readonly PlacedLabel[];
  /** Colour per territory id; a territory may be absent (empty palette), painters then use `theme.pointNeutral`. */
  colours: ReadonlyMap<string, string>;
  /** Territory ids, largest total ring area first: the fill layer's paint order. */
  paintOrder: readonly string[];
  /** The spec's groups (`deriveTerritoryGroups`); empty when it has none. */
  groups: readonly TerritoryGroup[];
  /** One placed name per group, measured in the large font plus its letter spacing; `id` is the group's id. */
  groupLabels: readonly PlacedLabel[];
  /** Each territory's world-space bounding box; a territory without rings is absent. */
  bounds: ReadonlyMap<string, Bounds>;
}

function largestRing(rings: readonly Ring[]): Ring | undefined {
  let best: Ring | undefined;
  for (const ring of rings) if (!best || ringArea(ring) > ringArea(best)) best = ring;
  return best;
}

/** Extra space between a group name's letters, in CSS pixels; the painter draws with the same value. */
export const GROUP_LETTER_SPACING = 1;

/**
 * The member-count-weighted mean of the members' centroids, unless it lies
 * outside every member ring (a group of two distant regions): then the
 * largest member's own name anchor, which always sits inside that member.
 */
function groupAnchor(
  group: TerritoryGroup,
  territories: ReadonlyMap<string, Territory>,
  shapes: ReadonlyMap<string, Ring[]>,
  anchors: ReadonlyMap<string, Point>,
): Point {
  const largestAnchor = anchors.get(group.members[0] as string) as Point;
  let weight = 0;
  let horizontal = 0;
  let vertical = 0;
  for (const id of group.members) {
    const territory = territories.get(id) as Territory;
    weight += territory.members.length;
    horizontal += territory.members.length * territory.centroid[0];
    vertical += territory.members.length * territory.centroid[1];
  }
  if (weight === 0) return largestAnchor;
  const mean: Point = [horizontal / weight, vertical / weight];
  const inside = group.members.some((id) => (shapes.get(id) ?? []).some((ring) => contains(ring, mean)));
  return inside ? mean : largestAnchor;
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
  theme: Pick<Theme, "territoryFonts" | "palette">,
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
  const anchors = new Map(inputs.map((input) => [input.id, input.anchor]));
  const territoriesById = new Map(spec.territories.map((territory) => [territory.id, territory]));
  const groups = deriveTerritoryGroups(spec);
  const groupFont = theme.territoryFonts.large;
  const spaced: Measure = (text, font) => {
    const measured = measure(text, font);
    return { width: measured.width + GROUP_LETTER_SPACING * text.length, height: measured.height };
  };
  const groupInputs = groups.map((group) => ({
    id: group.id,
    name: group.name,
    anchor: groupAnchor(group, territoriesById, shapes, anchors),
    members: group.members.reduce((total, id) => total + (territoriesById.get(id) as Territory).members.length, 0),
  }));
  const bounds = new Map<string, Bounds>();
  for (const [id, rings] of shapes) {
    const box = ringBounds(rings);
    if (box) bounds.set(id, box);
  }
  return {
    byId,
    shapes,
    labels: placeLabels(inputs, theme.territoryFonts, tuning.labelClasses, measure),
    colours: assignTerritoryColours(shapes, spec.territories, theme.palette),
    paintOrder: largestFirst(shapes),
    groups,
    groupLabels: placeLabels(
      groupInputs,
      { large: groupFont, medium: groupFont, small: groupFont },
      tuning.labelClasses,
      spaced,
    ),
    bounds,
  };
}
