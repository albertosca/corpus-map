import type { MapNode, MapSpec } from "../shared/spec";

/** One value of an attribute: a string stands for both the value and its label. */
export type FilterOption = string | { value: string; label: string };

/** Reads an item's value or values for the attribute being filtered; `undefined` or an empty list means it has none. */
export type FilterAttribute = (node: MapNode) => FilterOption | readonly FilterOption[] | undefined;

/** A distinct value of the attribute, with how many items have it. */
export interface Facet {
  value: string;
  label: string;
  count: number;
}

/** What one pass over a spec yields: the facets, and each item's distinct values in spec order. */
export interface FilterIndex {
  facets: readonly Facet[];
  items: readonly { id: string; values: readonly string[] }[];
}

/** The values an attribute gave for one item: nothing for `null`/`undefined`, a list as it is, anything else as a one-item list. */
function optionsOf(found: unknown): readonly unknown[] {
  if (found === undefined || found === null) return [];
  return Array.isArray(found) ? found : [found];
}

/** One option as a value and a label; a JavaScript consumer's number or null is read forgivingly, not thrown on. */
function readOption(option: unknown): { value: string; label: string } | null {
  if (option === undefined || option === null) return null;
  if (typeof option === "object") {
    const { value, label } = option as { value?: unknown; label?: unknown };
    if (value === undefined || value === null) return null;
    return { value: String(value), label: label === undefined || label === null ? String(value) : String(label) };
  }
  return { value: String(option), label: String(option) };
}

function compareText(first: string, second: string): number {
  if (first < second) return -1;
  return first > second ? 1 : 0;
}

function byLabelThenValue(first: Facet, second: Facet): number {
  return first.label.localeCompare(second.label) || compareText(first.value, second.value);
}

/** One pass over `spec`: each item once per value (empty values skipped), the first label in spec order wins. */
export function buildFilterIndex(spec: MapSpec, attribute: FilterAttribute): FilterIndex {
  const tally = new Map<string, Facet>();
  const items: { id: string; values: readonly string[] }[] = [];
  for (const node of spec.nodes) {
    const own: string[] = [];
    for (const raw of optionsOf(attribute(node))) {
      const option = readOption(raw);
      if (option === null) continue;
      const { value } = option;
      if (value === "" || own.includes(value)) continue;
      own.push(value);
      const known = tally.get(value);
      if (known) known.count += 1;
      else {
        tally.set(value, { value, label: option.label === "" ? value : option.label, count: 1 });
      }
    }
    items.push({ id: node.id, values: own });
  }
  return { facets: [...tally.values()].sort(byLabelThenValue), items };
}

/** The ids of the items having any selected value, in spec order; `null` while nothing is selected (no filter). */
export function idsFromIndex(index: FilterIndex, selected: ReadonlySet<string>): readonly string[] | null {
  if (selected.size === 0) return null;
  return index.items.filter((item) => item.values.some((value) => selected.has(value))).map((item) => item.id);
}

/** The distinct values of `attribute` over `spec`, sorted by label then value, each with its item count. */
export function facetsOf(spec: MapSpec, attribute: FilterAttribute): readonly Facet[] {
  return buildFilterIndex(spec, attribute).facets;
}

/** The ids having any of the `selected` values (OR inside one attribute); `null` when `selected` is empty. */
export function idsMatching(
  spec: MapSpec,
  attribute: FilterAttribute,
  selected: Iterable<string>,
): readonly string[] | null {
  return idsFromIndex(buildFilterIndex(spec, attribute), new Set(selected));
}

/** The ids in both lists, in the order of `first`; `null` means "no constraint" on that side. */
export function intersectMatches(
  first: readonly string[] | null,
  second: readonly string[] | null,
): readonly string[] | null {
  if (first === null) return second;
  if (second === null) return first;
  const allowed = new Set(second);
  return first.filter((id) => allowed.has(id));
}
