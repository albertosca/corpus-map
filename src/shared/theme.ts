import type { LabelClass } from "../labels/placement";
import { normaliseColour } from "./colourNotation";

export interface Theme {
  territoryLabel: string;
  /**
   * Fonts of the territory names by class; the family names use `large`, and
   * `compact` below a 600 px box (spec mobile §4). Absent `compact` is
   * `DEFAULT_COMPACT_GROUP_FONT`.
   */
  territoryFonts: Record<LabelClass, string> & { compact?: string | undefined };
  cardBackground: string;
  cardBorder: string;
  hoverBackground: string;
  hoverText: string;
  pointRadius: number;
  /**
   * Colour of the outline drawn on the canvas around the territory (or the
   * item's point) whose button in the accessible tree has keyboard focus —
   * the tree itself is visually hidden, so this is the only visible focus.
   * Opaque, and at least 3:1 against the map's background (WCAG 2.2 SC
   * 1.4.11); each theme's is checked against its pages, bare and under every
   * palette fill (`theme.test.ts`).
   */
  focusOutline: string;
  /** Line width of that outline, in CSS pixels. */
  focusOutlineWidth: number;
  /** The selected item's ring; absent falls back to `territoryLabel`, which clears 4.5:1 in both themes. */
  selectionRing?: string | undefined;
  /**
   * The related-item line and neighbour ring (spec slice E §6); opaque, at
   * least 3:1 over every page and fill. Absent falls back to `territoryLabel`.
   */
  edge?: string | undefined;
  /** Font of the item labels at near (spec item labels §2); absent is `DEFAULT_ITEM_LABEL_FONT` ("500 11px system-ui, sans-serif"). */
  itemLabelFont?: string | undefined;
  /**
   * Categorical colours for territories, assigned so that territories whose
   * visible borders touch get different colours (`territories/colour.ts`).
   * Each entry is opaque; the fill is composited at `territoryFillAlpha`.
   */
  palette: string[];
  /** Colour of a point with no territory, and of a territory the palette left uncoloured. */
  pointNeutral: string;
  /** Alpha at which the territory fill layer is composited (guided presentation); a visited territory is filled at up to 1.5 times it. */
  territoryFillAlpha: number;
  /**
   * How the canvas draws territory and family names (spec serious default §3):
   * `uppercase` upper-cases them, `spacing` is the extra space between letters in CSS pixels
   * (a finite number of at least 0; it replaces the families' 1 px). The transformed text
   * and the spacing are what is measured and placed as well as drawn. The accessible tree,
   * tooltip, legend and cards keep the real name. Absent, `undefined` or `{}` takes the house default (upper case, spacing 0.6) through `resolveTheme`; pass `{ uppercase: false }` for mixed case.
   */
  territoryNameStyle?: { uppercase?: boolean | undefined; spacing?: number | undefined } | undefined;
  /** Line width of a leaf territory's outline, in CSS pixels (spec consumer styles §3); absent is 1. A finite number above 0. */
  territoryOutlineWidth?: number | undefined;
  /** Line width of a family's outline; absent is 1.75. A finite number above 0. */
  groupOutlineWidth?: number | undefined;
  /** Line width of the ring that marks an unvisited point; absent is 1.5. `pointRadius` minus this must leave a hole (`checkTheme`). */
  unvisitedRingWidth?: number | undefined;
  /** Line width of the selected item's ring; absent is 2. */
  selectionRingWidth?: number | undefined;
  /** Line width of the ring around a search or filter match; absent is 1.5. */
  matchRingWidth?: number | undefined;
  /** Line width of a related item's ring; absent is 1.5. */
  neighbourRingWidth?: number | undefined;
}

/**
 * What a consumer passes as `theme` (spec consumer styles §2): every field optional, and the two
 * nested ones (`territoryFonts`, `territoryNameStyle`) optional field by field. `resolveTheme`
 * lays it over `DEFAULT_THEME`.
 */
export type ThemeInput = {
  [Field in Exclude<keyof Theme, "territoryFonts">]?: Theme[Field] | undefined;
} & {
  territoryFonts?:
    | { [Class in keyof Theme["territoryFonts"]]?: Theme["territoryFonts"][Class] | undefined }
    | undefined;
};

/** The family names' font below a 600 px box when the theme names none. */
export const DEFAULT_COMPACT_GROUP_FONT = "600 12px system-ui, sans-serif";

export const DEFAULT_THEME: Theme = {
  territoryLabel: "#23232d",
  territoryFonts: {
    large: "600 18px system-ui, sans-serif",
    medium: "600 14px system-ui, sans-serif",
    small: "500 12px system-ui, sans-serif",
    compact: DEFAULT_COMPACT_GROUP_FONT,
  },
  cardBackground: "#ffffff",
  cardBorder: "rgba(120,120,140,0.45)",
  hoverBackground: "rgba(30,30,40,0.92)",
  hoverText: "#ffffff",
  pointRadius: 2.4,
  focusOutline: "#1d4ed8",
  focusOutlineWidth: 3,
  edge: "#4a4a58",
  // Ink and paper (spec serious default §2): steel blue, ochre, olive, violet, brown, sage, slate, mauve; metric 17 measured, not guessed.
  palette: ["#065781", "#9a6232", "#525000", "#7466a9", "#603d36", "#5e715f", "#3e4951", "#856e81"],
  pointNeutral: "#5b6170",
  territoryFillAlpha: 0.16,
  territoryNameStyle: { uppercase: true, spacing: 0.6 },
};

/** For a dark page (`#18181b` or darker); every colour is checked by metrics 15-17 and the focus test. */
export const DARK_THEME: Theme = {
  ...DEFAULT_THEME,
  territoryLabel: "#ececf1",
  palette: ["#619c9f", "#e8c270", "#91963f", "#807cc6", "#9d7e73", "#a7cdb0", "#b6abf6", "#d4c5d8"],
  pointNeutral: "#a0a6b4",
  cardBackground: "rgb(28,28,32)",
  cardBorder: "rgba(160,160,180,0.45)",
  hoverBackground: "rgba(240,240,245,0.94)",
  hoverText: "#111114",
  focusOutline: "#7aa7ff",
  edge: "#c4c4d0",
};

const WIDTH_FIELDS = [
  "territoryOutlineWidth",
  "groupOutlineWidth",
  "unvisitedRingWidth",
  "selectionRingWidth",
  "matchRingWidth",
  "neighbourRingWidth",
] as const;

/** An object without the entries whose value is `undefined`, so a spread never overwrites a default with it. */
function defined<Shape extends object>(
  value: Shape | undefined,
): { [Field in keyof Shape]?: Exclude<Shape[Field], undefined> } {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, entry]) => entry !== undefined)) as {
    [Field in keyof Shape]?: Exclude<Shape[Field], undefined>;
  };
}

const COLOUR_FIELDS = ["territoryLabel", "pointNeutral", "focusOutline", "selectionRing", "edge"] as const;

/**
 * The theme a consumer's `ThemeInput` describes: `DEFAULT_THEME` under it, `territoryFonts` and
 * `territoryNameStyle` merged field by field, a field present as `undefined` taking the default.
 * A width that is not a finite number above 0 is a `RangeError` naming the field. A colour written
 * as `#rgb`, `hsl()` or a CSS name is turned into `#rrggbb` (or `rgba()`) here, so the painters and the checks only
 * meet notations they read.
 */
export function resolveTheme(input: ThemeInput | undefined): Theme {
  if (input === undefined) return DEFAULT_THEME;
  const theme: Theme = {
    ...DEFAULT_THEME,
    ...defined(input),
    territoryFonts: { ...DEFAULT_THEME.territoryFonts, ...defined(input.territoryFonts) },
    territoryNameStyle: { ...DEFAULT_THEME.territoryNameStyle, ...defined(input.territoryNameStyle) },
  };
  for (const field of WIDTH_FIELDS) {
    const width = theme[field];
    if (width !== undefined && !(Number.isFinite(width) && width > 0))
      throw new RangeError(`Theme.${field} must be a finite number greater than 0, got ${String(width)}`);
  }
  theme.palette = theme.palette.map(normaliseColour);
  for (const field of COLOUR_FIELDS) {
    const colour = theme[field];
    if (colour !== undefined) theme[field] = normaliseColour(colour);
  }
  return theme;
}
