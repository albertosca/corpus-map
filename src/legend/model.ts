import type { TerritoryGroup } from "../territories/groups";
import type { LegendEntry } from "./entries";

/** The id of the single headerless group a corpus without groups is shown as. */
export const FLAT_GROUP_ID = "all";

export interface LegendRow extends LegendEntry {
  onScreen: boolean;
  hidden: boolean;
}

export interface LegendGroupView {
  id: string;
  name: string;
  /** The rows the filter lets through: on screen first, each part most members first. */
  rows: LegendRow[];
  /** Every member, filter or not: what the group checkbox acts on. */
  memberIds: string[];
  onScreenCount: number;
  /** Shown state of every member: drives the three-state group checkbox. */
  shown: "all" | "none" | "mixed";
}

function normalise(filter: string): string {
  return filter.trim().toLowerCase();
}

/**
 * The legend's content (spec categories §6): groups in the given order, a
 * group kept only when a row survives the filter. The filter is a literal,
 * case-insensitive substring of a territory's name, its id or its group's
 * name; a match on the group's name keeps every member. Without groups the
 * whole list is one headerless group.
 */
export function legendModel(
  entries: readonly LegendEntry[],
  groups: readonly TerritoryGroup[],
  onScreen: ReadonlySet<string>,
  hidden: ReadonlySet<string>,
  filter: string,
): { flat: boolean; groups: LegendGroupView[] } {
  const needle = normalise(filter);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const sources =
    groups.length > 0
      ? groups
      : [{ id: FLAT_GROUP_ID, name: "", members: entries.map((entry) => entry.id) } satisfies TerritoryGroup];
  const views: LegendGroupView[] = [];
  for (const group of sources) {
    const members = group.members.flatMap((id) => {
      const found = byId.get(id);
      return found ? [found] : [];
    });
    const groupMatches = needle !== "" && group.name.toLowerCase().includes(needle);
    const kept = members.filter(
      (entry) =>
        needle === "" ||
        groupMatches ||
        entry.name.toLowerCase().includes(needle) ||
        entry.id.toLowerCase().includes(needle),
    );
    if (kept.length === 0) continue;
    const rows = kept.map((entry) => ({ ...entry, onScreen: onScreen.has(entry.id), hidden: hidden.has(entry.id) }));
    const ordered = [...rows.filter((row) => row.onScreen), ...rows.filter((row) => !row.onScreen)];
    const hiddenCount = members.filter((entry) => hidden.has(entry.id)).length;
    views.push({
      id: group.id,
      name: group.name,
      rows: ordered,
      memberIds: members.map((entry) => entry.id),
      onScreenCount: members.filter((entry) => onScreen.has(entry.id)).length,
      shown: hiddenCount === 0 ? "all" : hiddenCount === members.length ? "none" : "mixed",
    });
  }
  return { flat: groups.length === 0, groups: views };
}

/** Whether a group is expanded: every match while filtering, else the reader's choice, else whether anything is on screen. */
export function groupOpen(group: LegendGroupView, filter: string, manual: boolean | undefined): boolean {
  if (normalise(filter) !== "") return true;
  if (manual !== undefined) return manual;
  return group.onScreenCount > 0;
}
