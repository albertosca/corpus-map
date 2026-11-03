/**
 * Shared geometry constants for the demo's floating controls (showcase
 * Task 6 fix round 2) — used by `Indicator` (its own position above the
 * minimap), by `ZoomControls` (to decide when it is safe to shift beside
 * the open drawer, without landing on the library's own minimap or the
 * indicator above it) and by `App.test.tsx`'s pairwise collision check, so
 * they stay in sync by construction rather than by hand-kept copies of the
 * same numbers.
 */

/**
 * Mirrors `src/minimap/Minimap.tsx`'s `MINIMAP_SIZE` — a 160x110 canvas.
 * Not re-exported through `corpus-map`'s own public door (`src/index.ts`),
 * so this is a demo-side copy rather than an import; do not touch `src/`
 * to add one (showcase Task 6 fix round 1, ruling 4).
 */
export const MINIMAP_WIDTH = 160;
export const MINIMAP_HEIGHT = 110;

/**
 * Mirrors `src/minimap/Minimap.tsx`'s own private `MARGIN` (12) — the
 * corner margin every `MinimapCorner` uses. The demo only ever renders
 * `"bottom-left"` (`App.tsx`'s `<CorpusMap minimap ... />`), so this is
 * also the minimap's distance from the box's left and bottom edges.
 * `Indicator.tsx` reads it from here to stack itself directly above the
 * minimap.
 */
export const MINIMAP_MARGIN = 12;

/** The indicator's `left`, used by `Indicator.tsx` itself. */
export const INDICATOR_LEFT = MINIMAP_MARGIN;

/**
 * `Indicator.tsx` sets no fixed pixel `width` — only `maxWidth: "55vw"` on
 * `nowrap` + `textOverflow: "ellipsis"` content, so its real rendered
 * width is governed by its text, capped by that 55vw ceiling. jsdom has no
 * layout engine and cannot measure text (the same limitation the rest of
 * this file's callers work around), so this is a documented estimate, not
 * a fact: the longest plausible string the indicator ever shows is
 * `"near · 64.0× · 10000 items"` (~26 characters) — `far`/`mid`/`near` are
 * its only three regime words, `64.0×` is `MAX_ZOOM_IN`'s own ceiling
 * (`src/CorpusMap.tsx`) formatted to one decimal (a keep-view resize can
 * leave the ratio above it, e.g. `158.1×` after shrinking the window at
 * full zoom: one character more, which the rounding below still covers; a
 * ratio of 1000 or more would need the window shrunk about sixteenfold at
 * full zoom), and `10000` is the
 * synthetic corpus's own top size (spec 4 §2, `App.tsx`'s tuning panel
 * range). At roughly 7px/character for 13px system-ui text, plus the
 * indicator's own `padding: "4px 10px"` (20px), that is ~202px; rounded up
 * for safety margin.
 */
export const INDICATOR_MAXIMUM_CONTENT_WIDTH = 210;

/** Breathing room between any two of these boxes, or between one of them and the viewport edge. */
export const GUTTER = 12;

/**
 * How far the bottom-left column (the minimap, and the indicator stacked
 * above it) reaches from the viewport's left edge — the greater of the
 * two, since either could be the one a shifted control needs to clear.
 */
export const BOTTOM_LEFT_COLUMN_WIDTH = Math.max(
  MINIMAP_MARGIN + MINIMAP_WIDTH,
  INDICATOR_LEFT + INDICATOR_MAXIMUM_CONTENT_WIDTH,
);

/**
 * Height estimates for the bottom row's content-sized boxes (jsdom cannot
 * measure them, and neither can this module): 3 buttons × (~15.6px line
 * height + 12px padding + 2px border) + 2 × 6px gaps ≈ 100.8 for the zoom
 * controls; ~15.6px line height + 8px padding + 2px border for the
 * indicator. Shared by `Footer` (to lift itself clear of the row) and by
 * `App.test.tsx`'s collision check.
 */
export const ZOOM_CONTROLS_HEIGHT_ESTIMATE = 101;
export const INDICATOR_HEIGHT_ESTIMATE = 26;

/** The indicator's `bottom`: stacked one gutter above the minimap. */
export const INDICATOR_BOTTOM = MINIMAP_MARGIN + MINIMAP_HEIGHT + GUTTER;

/**
 * How far the bottom row (minimap + indicator on the left, zoom controls on
 * the right, all anchored `bottom: 12`) reaches up from the viewport's bottom
 * edge — the taller of its two columns.
 */
export const BOTTOM_ROW_HEIGHT = Math.max(
  INDICATOR_BOTTOM + INDICATOR_HEIGHT_ESTIMATE,
  MINIMAP_MARGIN + ZOOM_CONTROLS_HEIGHT_ESTIMATE,
);

/**
 * The footer's placement rule (2026-09-25 browser review, B9): it sits in the
 * bottom row, between the bottom-left column and the zoom controls, when the
 * band between them is at least this wide — about 30 characters of 12px
 * text, so the arXiv sentence wraps to at most three legible lines. Below
 * that it is lifted one gutter above the whole bottom row instead, spanning
 * from the left gutter to the zoom controls' right edge.
 */
export const FOOTER_MINIMUM_BAND_WIDTH = 200;

/** The footer chip's own width ceiling, centred in its band (at or under the 343px content width of a 375px viewport). */
export const FOOTER_MAXIMUM_WIDTH = 340;

/**
 * The narrow window's bottom strip (spec mobile §6), which holds the
 * indicator and the credit side by side: at most two 12 px lines (~15 px
 * each) plus 4 px of padding above and below and a 1 px border, rounded up.
 * Fit sits one gutter above it.
 */
export const STRIP_HEIGHT_ESTIMATE = 40;

/**
 * The dialogue panel (spec assistant §7). Wide: a column at the left edge,
 * above the bottom-left column and the footer when it is lifted (three lines
 * of 12 px text at most, `FOOTER_LIFT_ESTIMATE`); narrow: a sheet under the
 * top bar. Its height is a share of the window's, so the map keeps the rest.
 */
export const ASSISTANT_PANEL_WIDTH = 320;
export const FOOTER_LIFT_ESTIMATE = 64;
export const ASSISTANT_PANEL_BOTTOM = BOTTOM_ROW_HEIGHT + GUTTER + FOOTER_LIFT_ESTIMATE;
const ASSISTANT_PANEL_WIDE_HEIGHT_SHARE = 0.4;
const ASSISTANT_PANEL_NARROW_HEIGHT_SHARE = 0.45;

/** The panel's height ceiling in whole pixels for a window of this height. */
export function assistantPanelHeight(windowHeight: number, narrow: boolean): number {
  return Math.round(windowHeight * (narrow ? ASSISTANT_PANEL_NARROW_HEIGHT_SHARE : ASSISTANT_PANEL_WIDE_HEIGHT_SHARE));
}
