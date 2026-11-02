/**
 * The set of ids a search found, from the `matches` prop: `undefined` and
 * `null` mean no search is active (spec search §2); an array becomes a set,
 * which collapses its duplicates; a set is used as it is.
 */
export function toMatchSet(
  matches: ReadonlySet<string> | readonly string[] | null | undefined,
): ReadonlySet<string> | undefined {
  if (matches === undefined || matches === null) return undefined;
  return Array.isArray(matches) ? new Set<string>(matches) : (matches as ReadonlySet<string>);
}
