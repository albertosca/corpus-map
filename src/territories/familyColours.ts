import { contrastRatio, parseColor } from "../labels/contrast";
import type { Territory } from "../shared/spec";
import type { Theme } from "../shared/theme";
import { assignTerritoryColours, largestFirst, visibleBorders } from "./colour";
import type { TerritoryGroup } from "./groups";
import type { Ring } from "./shape";
import { TINT_STEPS, tint, tintBand } from "./tint";

/**
 * Which way family tints move: towards the territory label's lightness, so
 * away from the page (a dark label means a light page, so tints darken).
 * Moving one way only keeps every tint at least as far from the page as its
 * palette colour, which metric 15 needs (spec slice E §5).
 */
export function tintDirection(theme: Pick<Theme, "territoryLabel">): 1 | -1 {
  const label = parseColor(theme.territoryLabel);
  return contrastRatio(label, parseColor("#000000")) > contrastRatio(label, parseColor("#ffffff")) ? 1 : -1;
}

function compareIds(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

/**
 * Family colours from the palette, coloured over the family regions the way
 * territories are coloured today, then each child a tint of its family's
 * colour: leaves walk most-visible first and take the tint that shares the
 * least visible border with their already coloured neighbours. A declared
 * `colour` wins, on a parent and on a child (spec slice E §5).
 */
export function familyColours(
  shapes: ReadonlyMap<string, readonly Ring[]>,
  groupShapes: ReadonlyMap<string, readonly Ring[]>,
  groups: readonly TerritoryGroup[],
  territories: readonly Territory[],
  palette: readonly string[],
  direction: 1 | -1,
): { colours: Map<string, string>; groupColours: Map<string, string> } {
  const asTerritories = groups.map(
    (group): Territory => ({
      id: group.id,
      name: group.name,
      members: [],
      centroid: [0, 0],
      ...(group.colour === undefined ? {} : { colour: group.colour }),
    }),
  );
  const groupColours = assignTerritoryColours(groupShapes, asTerritories, palette);
  const declared = new Map(
    territories.flatMap((territory) =>
      territory.colour === undefined ? [] : [[territory.id, territory.colour] as const],
    ),
  );
  const band = tintBand(palette, direction);
  const familyOf = new Map(groups.flatMap((group) => group.members.map((member) => [member, group.id] as const)));
  const colours = new Map<string, string>();
  for (const [id, colour] of declared) if (familyOf.has(id)) colours.set(id, colour);
  // One walk over every leaf, most visible first, so a tint is chosen
  // against every neighbour already coloured, sibling or not: two families
  // may share a palette colour when their regions do not touch while two of
  // their leaves do.
  const { visibleCells, neighbours } = visibleBorders(shapes, largestFirst(shapes));
  const order = [...familyOf.keys()].sort(
    (first, second) => (visibleCells.get(second) ?? 0) - (visibleCells.get(first) ?? 0) || compareIds(first, second),
  );
  for (const id of order) {
    const base = groupColours.get(familyOf.get(id) as string);
    if (base === undefined || colours.has(id)) continue;
    const candidates = TINT_STEPS.map((step) => tint(base, step, direction, band));
    const cost = candidates.map((candidate) => {
      let shared = 0;
      for (const [neighbour, length] of neighbours.get(id) ?? [])
        if (colours.get(neighbour) === candidate) shared += length;
      return shared;
    });
    let best = 0;
    for (const [index, value] of cost.entries()) if (value < (cost[best] ?? 0)) best = index;
    colours.set(id, candidates[best] as string);
  }
  return { colours, groupColours };
}
