import type { CorpusMapHandle } from "corpus-map";
import type { CSSProperties, ReactElement, RefObject } from "react";
import { token } from "../tokens";
import { DRAWER_MAXIMUM_WIDTH } from "./Drawer";
import { BOTTOM_LEFT_COLUMN_WIDTH, GUTTER, STRIP_HEIGHT_ESTIMATE } from "./floatingLayout";
import { useViewportWidth } from "./narrow";

interface ZoomControlsProps {
  mapRef: RefObject<CorpusMapHandle | null>;
  /** Whether the selected-item drawer is currently open (showcase Task 6 fix round 1). */
  drawerOpen?: boolean | undefined;
  /**
   * A narrow window (spec mobile §6): Fit alone, 44 × 44 (pinch and double tap replace Zoom in/out), one gutter above
   * whatever covers the bottom edge — the strip, or the open sheet whose height `coveredBottom` gives.
   */
  narrow?: boolean | undefined;
  /** On a narrow window, how much of the bottom edge is covered: the collapsed sheet's height while one is open, else the strip's. */
  coveredBottom?: number | undefined;
}

/** Fit's side on a narrow window: the 44 px touch target (spec mobile §6). */
const NARROW_BUTTON_SIZE = 44;

/** The buttons' own width — shared with `buttonStyle` below and with the breakpoint calculation; exported so the test can compute the same breakpoint rather than duplicating the number. */
export const BUTTON_WIDTH = 84;

/**
 * The shifted position's own footprint (a gutter, the button width,
 * another gutter) plus the drawer's own width ceiling plus the gutter
 * between them, plus — showcase Task 6 fix round 2 — the bottom-left
 * column's own width (the minimap, or the indicator above it if that is
 * wider) plus a gutter past it, since the first version of this shift
 * (fix round 1) only cleared the drawer and, for a stretch of
 * intermediate viewport widths, landed the controls directly on top of
 * the minimap and, at those same widths, close enough to the indicator to
 * matter (`task-6-rereview.md`'s new [Important] finding). Below this
 * viewport width there is nowhere to put the controls that clears both
 * the drawer AND that column, so `ZoomControls` falls back to letting the
 * drawer cover it (reversible — see `Drawer.tsx`'s own doc comment)
 * rather than landing on other floating controls or off screen.
 */
const WIDE_ENOUGH_TO_SHIFT_PX =
  BOTTOM_LEFT_COLUMN_WIDTH + GUTTER + BUTTON_WIDTH + GUTTER + DRAWER_MAXIMUM_WIDTH + GUTTER;

/**
 * The controls' `right` offset at a viewport width, with the drawer (or the
 * tuning panel, which takes the same slot) open or closed — shifted left of
 * the drawer only when the viewport is wide enough (see above). Exported so
 * `Footer` places itself against the same position the controls actually use.
 */
export function zoomControlsRight(viewportWidth: number, drawerOpen: boolean): number {
  return drawerOpen && viewportWidth >= WIDE_ENOUGH_TO_SHIFT_PX ? DRAWER_MAXIMUM_WIDTH + GUTTER : GUTTER;
}

const wrapStyle: CSSProperties = {
  position: "fixed",
  bottom: 12,
  zIndex: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  // The wrapper's own declared width (Task 7 fix round 1): before this it
  // was only implicitly `BUTTON_WIDTH` via its children's own `width`, with
  // nothing on the container itself for `App.test.tsx`'s overflow check to
  // read -- `checkAllFloatingControls` no longer walks descendant
  // buttons/selects (see that helper's own doc comment), so the container
  // has to state its own footprint explicitly.
  width: BUTTON_WIDTH,
};

const buttonStyle: CSSProperties = {
  width: BUTTON_WIDTH,
  padding: "6px 10px",
  borderRadius: 4,
  border: `1px solid ${token("borderStrong")}`,
  background: token("surface"),
  color: token("text"),
  fontSize: 13,
};

/**
 * Zoom in / zoom out / fit, bottom-right (spec 4 §2), driving the library's
 * own imperative handle (`CorpusMapHandle`, showcase Task 3) rather than any
 * zoom logic of its own. A no-op before the map has attached its handle.
 *
 * Showcase Task 6 fix round 1: when the selected-item drawer is open and
 * the viewport is wide enough for both (see `WIDE_ENOUGH_TO_SHIFT_PX`), the
 * controls shift left of the drawer's edge instead of sitting under it —
 * both stay visible and clickable at once. Below that width the drawer
 * covers the controls (`Drawer.tsx`'s own doc comment covers why that is an
 * acceptable, reversible fallback rather than a bug).
 */
export function ZoomControls({
  mapRef: mapReference,
  drawerOpen = false,
  narrow = false,
  coveredBottom = STRIP_HEIGHT_ESTIMATE,
}: ZoomControlsProps): ReactElement {
  const viewportWidth = useViewportWidth();
  if (narrow) {
    return (
      <div
        data-zoom-controls
        data-floating-control
        style={{ ...wrapStyle, width: NARROW_BUTTON_SIZE, right: GUTTER, bottom: coveredBottom + GUTTER }}
      >
        <button
          type="button"
          style={{ ...buttonStyle, width: NARROW_BUTTON_SIZE, minHeight: NARROW_BUTTON_SIZE, padding: 0 }}
          onClick={() => mapReference.current?.fit()}
        >
          Fit
        </button>
      </div>
    );
  }
  const style: CSSProperties = { ...wrapStyle, right: zoomControlsRight(viewportWidth, drawerOpen) };
  return (
    <div data-zoom-controls data-floating-control style={style}>
      <button type="button" style={buttonStyle} onClick={() => mapReference.current?.zoomIn()}>
        Zoom in
      </button>
      <button type="button" style={buttonStyle} onClick={() => mapReference.current?.zoomOut()}>
        Zoom out
      </button>
      <button type="button" style={buttonStyle} onClick={() => mapReference.current?.fit()}>
        Fit
      </button>
    </div>
  );
}
