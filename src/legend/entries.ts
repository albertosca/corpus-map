import { compareIds } from "../shared/compareIds";
import { CORNER_MARGIN, type Corner } from "../shared/corner";
import type { Territory } from "../shared/spec";

export interface LegendEntry {
  id: string;
  name: string;
  colour: string;
  members: number;
}

/** Every territory, most members first (ties by id), each with its painted colour (spec categories §6). */
export function legendEntries(
  territories: readonly Territory[],
  colours: ReadonlyMap<string, string>,
  fallback: string,
): LegendEntry[] {
  return [...territories]
    .sort((first, second) => second.members.length - first.members.length || compareIds(first.id, second.id))
    .map((territory) => ({
      id: territory.id,
      name: territory.name,
      colour: colours.get(territory.id) ?? fallback,
      members: territory.members.length,
    }));
}

const CLOCKWISE: readonly Corner[] = ["top-left", "top-right", "bottom-right", "bottom-left"];

/** The requested corner, or the next one clockwise when the minimap already sits there. */
export function legendCorner(requested: Corner, minimap: Corner | null): Corner {
  if (requested !== minimap) return requested;
  return CLOCKWISE[(CLOCKWISE.indexOf(requested) + 1) % CLOCKWISE.length] as Corner;
}

/**
 * The legend's height ceiling: its column less the two margins, and less the
 * minimap's height and one more margin when the minimap sits at the other end
 * of the same side — an expanded legend otherwise runs down over it.
 */
export function legendMaximumHeight(legend: Corner, minimap: Corner | null, minimapHeight: number): string {
  const sameSide = minimap !== null && minimap !== legend && minimap.endsWith(legend.split("-")[1] as string);
  const reserved = 2 * CORNER_MARGIN + (sameSide ? minimapHeight + CORNER_MARGIN : 0);
  return `calc(100% - ${reserved}px)`;
}
