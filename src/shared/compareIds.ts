/** Orders ids by code unit, the tie-break every sorted list in the map uses so the order never depends on the input's. */
export function compareIds(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}
