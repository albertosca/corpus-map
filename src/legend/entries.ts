import type { Corner } from "../shared/corner";
import type { Territory } from "../shared/spec";

/** Territories the legend lists before "+N more" (spec slice D §4). */
export const LEGEND_ENTRY_LIMIT = 8;

export interface LegendEntry {
  id: string;
  name: string;
  colour: string;
  members: number;
}

function compareIds(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

/** The largest territories by member count (ties by id), each with its painted colour, and how many were left out. */
export function legendEntries(
  territories: readonly Territory[],
  colours: ReadonlyMap<string, string>,
  fallback: string,
  limit: number = LEGEND_ENTRY_LIMIT,
): { entries: LegendEntry[]; more: number } {
  const sorted = [...territories].sort(
    (first, second) => second.members.length - first.members.length || compareIds(first.id, second.id),
  );
  const entries = sorted.slice(0, limit).map((territory) => ({
    id: territory.id,
    name: territory.name,
    colour: colours.get(territory.id) ?? fallback,
    members: territory.members.length,
  }));
  return { entries, more: Math.max(0, sorted.length - limit) };
}

const CLOCKWISE: readonly Corner[] = ["top-left", "top-right", "bottom-right", "bottom-left"];

/** The requested corner, or the next one clockwise when the minimap already sits there. */
export function legendCorner(requested: Corner, minimap: Corner | null): Corner {
  if (requested !== minimap) return requested;
  return CLOCKWISE[(CLOCKWISE.indexOf(requested) + 1) % CLOCKWISE.length] as Corner;
}
