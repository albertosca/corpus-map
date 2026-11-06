/** The visited share is rounded to the nearest 1/`VISITED_STEPS` (spec far-visited §2). */
export const VISITED_STEPS = 4;
/** A territory with every node visited is filled at `1 + VISITED_MAXIMUM_BOOST` times the base alpha. */
export const VISITED_MAXIMUM_BOOST = 0.75;

/** The factor a territory's fill alpha is multiplied by: 1 for no visited node, 1.75 for all (spec far-visited §2). */
export function visitedFactor(share: number): number {
  return 1 + (VISITED_MAXIMUM_BOOST * Math.round(share * VISITED_STEPS)) / VISITED_STEPS;
}
