/** A dimmed territory's fill, outline, points and name are drawn at this fraction of their alpha (spec categories §5). */
export const DIMMED_ALPHA = 0.15;

/** The empty dimmed set, shared so a default argument never allocates. */
export const NO_DIMMED: ReadonlySet<string> = new Set();
