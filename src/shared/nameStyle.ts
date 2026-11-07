import type { Theme } from "./theme";

/** A theme's territory-name style with its defaults applied; `spacing` stays undefined when the theme names none. */
export interface ResolvedNameStyle {
  uppercase: boolean;
  spacing: number | undefined;
}

/**
 * Validates and resolves `Theme.territoryNameStyle` (spec serious default §3).
 * Absent or `{}` is today's behaviour. `spacing` must be a finite number of at
 * least 0: anything else throws, since the theme itself has no validation.
 */
export function resolveNameStyle(style: Theme["territoryNameStyle"]): ResolvedNameStyle {
  const spacing = style?.spacing;
  if (spacing !== undefined && !(Number.isFinite(spacing) && spacing >= 0))
    throw new RangeError(`Theme.territoryNameStyle.spacing must be a finite number of at least 0, got ${spacing}`);
  return { uppercase: style?.uppercase === true, spacing };
}

/** The text a territory or family name is measured and drawn as; the page's default locale decides the case. */
export function styledName(name: string, uppercase: boolean): string {
  return uppercase ? name.toLocaleUpperCase() : name;
}
