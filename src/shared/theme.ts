import type { LabelClass } from "../labels/placement";

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
   * tooltip, legend and cards keep the real name. Absent or `{}` draws as before.
   */
  territoryNameStyle?: { uppercase?: boolean | undefined; spacing?: number | undefined } | undefined;
}

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
