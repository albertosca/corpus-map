import { buildRelated, type RelatedEdge } from "../edges/related";
import { type Measure, type PlacedLabel, placeLabels } from "../labels/placement";
import { poleOfInaccessibility } from "../labels/pole";
import { assignTerritoryColours, largestFirst } from "../territories/colour";
import { familyColours, tintDirection } from "../territories/familyColours";
import { deriveTerritoryGroups, type TerritoryGroup } from "../territories/groups";
import { contains, disksOutline, extent, type Point, type Ring, ringArea, spacing } from "../territories/shape";
import { type Bounds, ringBounds } from "../viewport/fit";
import { resolveNameStyle, styledName } from "./nameStyle";
import { leafTerritories, type MapNode, type MapSpec, parentIds, type Territory } from "./spec";
import { finish, type Steps } from "./steps";
import { DEFAULT_COMPACT_GROUP_FONT, type Theme } from "./theme";
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
  /** The same names placed in `compactGroupFont`, drawn below a `NARROW_BOX_WIDTH` box (spec mobile §4); empty without groups. */
  compactGroupLabels: readonly PlacedLabel[];
  /** The theme's `territoryFonts.compact`, or `DEFAULT_COMPACT_GROUP_FONT`. */
  compactGroupFont: string;
  /** Each territory's world-space bounding box; a territory without rings is absent. */
  bounds: ReadonlyMap<string, Bounds>;
  /**
   * Each group's region, keyed by group id (spec slice E §3): a declared
   * parent's `boundary` when it has one, a group of one its leaf's shape,
   * otherwise the disks outline of every member point. Empty without groups.
   */
  groupShapes: ReadonlyMap<string, Ring[]>;
  /** Each group's world-space bounding box; a group without rings is absent. */
  groupBounds: ReadonlyMap<string, Bounds>;
  /** Each family's colour, keyed by group id (spec slice E §5); empty without groups. */
  groupColours: ReadonlyMap<string, string>;
  /** Each item's related items, heaviest first (spec slice E §6); empty without edges. */
  related: ReadonlyMap<string, readonly RelatedEdge[]>;
  /** The heaviest edge weight in the spec, so widths scale against it; 0 when no edge carries one. */
  maximumEdgeWeight: number;
  /**
   * Visited nodes over all nodes, per leaf territory id (spec far-visited §3); a territory with no visited node is
   * absent. Empty when no node is visited, so such a spec paints exactly what it painted before.
   */
  visitedShare: ReadonlyMap<string, number>;
  /** The same per family id, over all its leaves' nodes; a separate map because family ids are not territory ids. */
  groupVisitedShare: ReadonlyMap<string, number>;
}

/** Each territory's share of nodes marked visited, a family's over all its leaves' nodes; zero shares are left out. */
function visitedShares(
  territories: ReadonlyMap<string, Territory>,
  groups: readonly TerritoryGroup[],
  byId: ReadonlyMap<string, MapNode>,
): { leaves: Map<string, number>; families: Map<string, number> } {
  const shares = new Map<string, number>();
  const familyShares = new Map<string, number>();
  const counts = new Map<string, { visited: number; total: number }>();
  for (const [id, territory] of territories) {
    const count = { visited: 0, total: territory.members.length };
    for (const member of territory.members) if (byId.get(member)?.state === "visited") count.visited += 1;
    counts.set(id, count);
    if (count.visited > 0) shares.set(id, count.visited / count.total);
  }
  for (const group of groups) {
    let visited = 0;
    let total = 0;
    for (const member of group.members) {
      visited += counts.get(member)?.visited ?? 0;
      total += counts.get(member)?.total ?? 0;
    }
    if (visited > 0) familyShares.set(group.id, visited / total);
  }
  return { leaves: shares, families: familyShares };
}

function largestRing(rings: readonly Ring[]): Ring | undefined {
  let best: Ring | undefined;
  for (const ring of rings) if (!best || ringArea(ring) > ringArea(best)) best = ring;
  return best;
}

/** Below this box width, in CSS pixels, the family names are the compact ones (spec mobile §4). */
export const NARROW_BOX_WIDTH = 600;

/** The family names a box `width` pixels wide fits and draws. */
export function groupLabelsFor(
  scene: Pick<Scene, "groupLabels" | "compactGroupLabels">,
  width: number,
): readonly PlacedLabel[] {
  return width < NARROW_BOX_WIDTH ? scene.compactGroupLabels : scene.groupLabels;
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
  parents: ReadonlySet<string>,
): Point {
  // A declared parent's own centroid anchors its name (spec slice E §3).
  const parent = parents.has(group.id) ? territories.get(group.id) : undefined;
  if (parent) return [parent.centroid[0], parent.centroid[1]];
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
  theme: Pick<Theme, "territoryFonts" | "palette" | "territoryLabel" | "territoryNameStyle">,
  measure: Measure,
): Scene {
  return finish(buildingScene(spec, tuning, theme, measure));
}

/** The scene of no corpus: what a map reads while its corpus's own scene is still being built. */
export const EMPTY_SCENE: Scene = {
  byId: new Map(),
  shapes: new Map(),
  labels: [],
  colours: new Map(),
  paintOrder: [],
  groups: [],
  groupLabels: [],
  compactGroupLabels: [],
  compactGroupFont: DEFAULT_COMPACT_GROUP_FONT,
  bounds: new Map(),
  groupShapes: new Map(),
  groupBounds: new Map(),
  groupColours: new Map(),
  related: new Map(),
  maximumEdgeWeight: 0,
  visitedShare: new Map(),
  groupVisitedShare: new Map(),
};

/**
 * Scene steps run in one slice: the first one runs during the render, so the
 * gallery's small corpora (17-27 steps) still build there, while a corpus
 * whose first region alone outweighs it (arXiv) builds nothing there; later
 * slices also stop at `SLICE_BUDGET_MILLISECONDS`, because steps differ in
 * cost. Counted in steps, not time, so that holds on every machine.
 */
export const SCENE_STEPS_PER_SLICE = 32;

/** Members whose outlining one scene step stands for, so a slice of steps holds about the same work on any corpus. */
export const SCENE_POINTS_PER_STEP = 50;

/** One step for a region, plus one per `SCENE_POINTS_PER_STEP` of its `points`. */
function* region(points: number): Steps<void> {
  const count = 1 + Math.ceil(points / SCENE_POINTS_PER_STEP);
  for (let step = 0; step < count; step += 1) yield;
}

/**
 * `buildScene` in steps (spec mobile §7): before each region (a leaf's shape
 * and name anchor, a family's shape), weighted by its points, and after the
 * colours and each name set, so a large corpus can be built across tasks.
 * A region's steps come before its work, so a first slice too small for the
 * first region (the one run during the render) does none of it.
 */
export function* buildingScene(
  spec: MapSpec,
  tuning: Pick<Tuning, "hullPadding" | "labelClasses">,
  theme: Pick<Theme, "territoryFonts" | "palette" | "territoryLabel" | "territoryNameStyle">,
  measure: Measure,
): Steps<Scene> {
  const byId = new Map(spec.nodes.map((node) => [node.id, node]));
  // Territories too small to measure their own spacing get disks 1% of the corpus wide.
  const fallback = 0.01 * Math.max(extent(spec.nodes.map((node) => [node.x, node.y] as Point)), 1e-9);
  const pointsOf = (territory: Territory) =>
    territory.members.flatMap((id) => {
      const node = byId.get(id);
      return node ? [[node.x, node.y] as Point] : [];
    });
  const outline = (points: readonly Point[]) => {
    const memberSpacing = points.length >= 3 ? spacing(points, 0.9) : 0;
    // Too few members to measure spacing: overlap the disks so one or two
    // members still read as one region, never as separate dots.
    const radius = memberSpacing > 0 ? tuning.hullPadding * memberSpacing : Math.max(fallback, 0.6 * extent(points));
    return disksOutline(points, radius);
  };
  const copyBoundary = (boundary: ReadonlyArray<readonly [number, number]>): Ring[] => [
    boundary.map(([horizontal, vertical]) => [horizontal, vertical] as Point),
  ];
  const shapes = new Map<string, Ring[]>();
  const leaves = leafTerritories(spec);
  const parents = parentIds(spec);
  const inputs: { id: string; name: string; anchor: Point; members: number }[] = [];
  for (const territory of leaves) {
    yield* region(territory.members.length);
    const rings = territory.boundary ? copyBoundary(territory.boundary) : outline(pointsOf(territory));
    shapes.set(territory.id, rings);
    const ring = largestRing(rings);
    const anchor: Point =
      ring && ring.length >= 3
        ? poleOfInaccessibility(ring, extent(ring) * 0.01)
        : [territory.centroid[0], territory.centroid[1]];
    inputs.push({ id: territory.id, name: territory.name, anchor, members: territory.members.length });
  }
  const anchors = new Map(inputs.map((input) => [input.id, input.anchor]));
  const territoriesById = new Map(spec.territories.map((territory) => [territory.id, territory]));
  const groups = deriveTerritoryGroups(spec);
  const groupFont = theme.territoryFonts.large;
  const compactGroupFont = theme.territoryFonts.compact ?? DEFAULT_COMPACT_GROUP_FONT;
  // The drawn text and spacing are what is measured (spec serious default §3), so a placed box is the drawn box.
  const nameStyle = resolveNameStyle(theme.territoryNameStyle);
  const styled =
    (letterSpacing: number): Measure =>
    (text, font) => {
      const drawn = styledName(text, nameStyle.uppercase);
      const measured = measure(drawn, font);
      return letterSpacing === 0
        ? measured
        : { width: measured.width + letterSpacing * drawn.length, height: measured.height };
    };
  const leafMeasure = styled(nameStyle.spacing ?? 0);
  const spaced = styled(nameStyle.spacing ?? GROUP_LETTER_SPACING);
  const groupInputs = groups.map((group) => ({
    id: group.id,
    name: group.name,
    anchor: groupAnchor(group, territoriesById, shapes, anchors, parents),
    members: group.members.reduce((total, id) => total + (territoriesById.get(id) as Territory).members.length, 0),
  }));
  const groupShapes = new Map<string, Ring[]>();
  for (const group of groups) {
    yield* region(
      group.members.reduce((total, id) => total + (territoriesById.get(id) as Territory).members.length, 0),
    );
    const parent = parents.has(group.id) ? territoriesById.get(group.id) : undefined;
    if (parent?.boundary) groupShapes.set(group.id, copyBoundary(parent.boundary));
    else if (group.members.length === 1 && group.members[0] === group.id)
      groupShapes.set(group.id, shapes.get(group.id) ?? []);
    else
      groupShapes.set(group.id, outline(group.members.flatMap((id) => pointsOf(territoriesById.get(id) as Territory))));
  }
  const boxes = (rings: ReadonlyMap<string, Ring[]>) => {
    const result = new Map<string, Bounds>();
    for (const [id, ringList] of rings) {
      const box = ringBounds(ringList);
      if (box) result.set(id, box);
    }
    return result;
  };
  // Every group is a family (spec slice E §1, "one mechanism"): declared by
  // `parent`, by `group`, or derived; without groups, today's colouring.
  const families =
    groups.length > 0
      ? familyColours(shapes, groupShapes, groups, leaves, theme.palette, tintDirection(theme))
      : { colours: assignTerritoryColours(shapes, leaves, theme.palette), groupColours: new Map<string, string>() };
  yield;
  const labels = placeLabels(inputs, theme.territoryFonts, tuning.labelClasses, leafMeasure);
  yield;
  const groupLabels = placeLabels(
    groupInputs,
    { large: groupFont, medium: groupFont, small: groupFont },
    tuning.labelClasses,
    spaced,
  );
  yield;
  const compactGroupLabels = placeLabels(
    groupInputs,
    { large: compactGroupFont, medium: compactGroupFont, small: compactGroupFont },
    tuning.labelClasses,
    spaced,
  );
  yield;
  const shares = visitedShares(territoriesById, groups, byId);
  return {
    byId,
    shapes,
    labels,
    colours: families.colours,
    paintOrder: largestFirst(shapes),
    groups,
    groupLabels,
    compactGroupLabels,
    compactGroupFont,
    bounds: boxes(shapes),
    groupShapes,
    groupBounds: boxes(groupShapes),
    groupColours: families.groupColours,
    related: buildRelated(spec),
    // A fold, not a spread: spreading a long edge list into Math.max overflows the call stack.
    maximumEdgeWeight: (spec.edges ?? []).reduce((heaviest, edge) => Math.max(heaviest, edge.weight ?? 0), 0),
    visitedShare: shares.leaves,
    groupVisitedShare: shares.families,
  };
}
