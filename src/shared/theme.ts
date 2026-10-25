import type { LabelClass } from "../labels/placement";

export interface Theme {
  territoryLabel: string;
  territoryFonts: Record<LabelClass, string>;
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
  /**
   * Categorical colours for territories, assigned so that territories whose
   * visible borders touch get different colours (`territories/colour.ts`).
   * Each entry is opaque; the fill is composited at `territoryFillAlpha`.
   */
  palette: string[];
  /** Colour of a point with no territory, and of a territory the palette left uncoloured. */
  pointNeutral: string;
  /** Alpha at which the single territory fill layer is composited (guided presentation). */
  territoryFillAlpha: number;
}

export const DEFAULT_THEME: Theme = {
  territoryLabel: "#23232d",
  territoryFonts: {
    large: "700 20px system-ui, sans-serif",
    medium: "600 15px system-ui, sans-serif",
    small: "500 12px system-ui, sans-serif",
  },
  cardBackground: "rgba(255,255,255,0.96)",
  cardBorder: "rgba(120,120,140,0.45)",
  hoverBackground: "rgba(30,30,40,0.92)",
  hoverText: "#ffffff",
  pointRadius: 3.5,
  focusOutline: "#1d4ed8",
  focusOutlineWidth: 3,
  edge: "#4a4a58",
  palette: ["#003c96", "#960000", "#005a2d", "#781e5a", "#7a45d6", "#0a7a70", "#876900", "#a53c4b"],
  pointNeutral: "#5b6170",
  territoryFillAlpha: 0.2,
};

/** For a dark page (`#18181b` or darker); every colour is checked by metrics 15-17 and the focus test. */
export const DARK_THEME: Theme = {
  ...DEFAULT_THEME,
  territoryLabel: "#ececf1",
  palette: ["#0087e1", "#e18769", "#00a500", "#b469a5", "#96a5d2", "#4fd1c5", "#b4c300", "#e14b78"],
  pointNeutral: "#a0a6b4",
  cardBackground: "rgba(28,28,32,0.96)",
  cardBorder: "rgba(160,160,180,0.45)",
  hoverBackground: "rgba(240,240,245,0.94)",
  hoverText: "#111114",
  focusOutline: "#7aa7ff",
  edge: "#c4c4d0",
};
