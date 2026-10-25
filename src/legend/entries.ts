import { compareIds } from "../shared/compareIds";
import type { Corner } from "../shared/corner";
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
