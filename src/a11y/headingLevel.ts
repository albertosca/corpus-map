export type HeadingLevel = 2 | 3 | 4 | 5 | 6;
export type HeadingTag = "h2" | "h3" | "h4" | "h5" | "h6";

export const DEFAULT_HEADING_LEVEL: HeadingLevel = 3;

/**
 * The element every heading the library renders uses (spec slice B §5): the
 * host page owns the outline, so it picks the level. Validated like
 * `resolveThresholds`, because a JavaScript consumer is not held to the type.
 */
export function resolveHeadingLevel(input: number | undefined): HeadingTag {
  const level = input ?? DEFAULT_HEADING_LEVEL;
  if (typeof level !== "number" || !Number.isInteger(level) || level < 2 || level > 6) {
    throw new RangeError(`headingLevel must be an integer from 2 to 6, got ${String(level)}`);
  }
  return `h${level}` as HeadingTag;
}
