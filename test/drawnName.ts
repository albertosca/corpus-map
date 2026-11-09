import { resolveNameStyle, styledName } from "../src/shared/nameStyle";
import { DEFAULT_THEME, type Theme } from "../src/shared/theme";

/** The text the canvas draws for a territory or family name under a theme's name style (default: the default theme). */
export function drawnName(name: string, theme: Pick<Theme, "territoryNameStyle"> = DEFAULT_THEME): string {
  return styledName(name, resolveNameStyle(theme.territoryNameStyle).uppercase);
}
