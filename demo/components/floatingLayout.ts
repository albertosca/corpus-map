/**
 * Shared geometry constants for the demo's floating controls (showcase
 * Task 6 fix round 2) — used both by `ZoomControls` (to decide when it is
 * safe to shift beside the open drawer, without landing on the library's
 * own minimap or the indicator above it) and by `App.test.tsx`'s pairwise
 * collision check, so the two stay in sync by construction rather than by
 * two hand-kept copies of the same numbers.
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
 * `Indicator.tsx` already carries its own copy of this same number under
 * the same name, for the same reason (it stacks directly above the
 * minimap) — this file does not replace that copy, only adds a second one
 * for `ZoomControls`/the test to share, rather than a third hand-typed 12.
 */
export const MINIMAP_MARGIN = 12;

/** Mirrors `Indicator.tsx`'s own `left: MINIMAP_MARGIN`. */
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
export const INDICATOR_MAX_CONTENT_WIDTH = 210;

/** Breathing room between any two of these boxes, or between one of them and the viewport edge. */
export const GUTTER = 12;

/**
 * How far the bottom-left column (the minimap, and the indicator stacked
 * above it) reaches from the viewport's left edge — the greater of the
 * two, since either could be the one a shifted control needs to clear.
 */
export const BOTTOM_LEFT_COLUMN_WIDTH = Math.max(
  MINIMAP_MARGIN + MINIMAP_WIDTH,
  INDICATOR_LEFT + INDICATOR_MAX_CONTENT_WIDTH,
);
