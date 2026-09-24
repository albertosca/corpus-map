import type { CorpusMapHandle } from "corpus-map";
import type { CSSProperties, ReactElement, RefObject } from "react";
import { useEffect, useState } from "react";
import { DRAWER_MAX_WIDTH } from "./Drawer";

interface ZoomControlsProps {
  mapRef: RefObject<CorpusMapHandle | null>;
  /** Whether the selected-item drawer is currently open (showcase Task 6 fix round 1). */
  drawerOpen?: boolean | undefined;
}

/** Breathing room between the controls and the drawer's edge, and between the controls and the viewport edge below that. */
const GUTTER = 12;

/** The buttons' own width — shared with `buttonStyle` below and with the breakpoint calculation. */
const BUTTON_WIDTH = 84;

/**
 * The controls' own footprint (a gutter, the button width, another gutter)
 * plus the drawer's own width ceiling plus the gutter between them: below
 * this viewport width there is nowhere to put the controls that does not
 * overlap the open drawer, so `ZoomControls` falls back to letting the
 * drawer cover it (reversible — see `Drawer.tsx`'s own doc comment) rather
 * than shifting into other floating controls or off screen.
 */
const WIDE_ENOUGH_TO_SHIFT_PX = GUTTER + BUTTON_WIDTH + GUTTER + DRAWER_MAX_WIDTH + GUTTER;

const wrapStyle: CSSProperties = {
  position: "fixed",
  bottom: 12,
  zIndex: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const buttonStyle: CSSProperties = {
  width: BUTTON_WIDTH,
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid rgba(0,0,0,0.2)",
  background: "rgba(255,255,255,0.92)",
  color: "#1a1d23",
  fontSize: 13,
};

/**
 * Whether the viewport is wide enough to shift the controls left of the
 * open drawer instead of letting it cover them. Read once at mount (a
 * client-only demo, never server-rendered, so there is no hydration
 * mismatch to guard against) and kept live across a real browser resize.
 */
function useIsWideEnoughToShift(): boolean {
  const [isWide, setIsWide] = useState(() => window.innerWidth >= WIDE_ENOUGH_TO_SHIFT_PX);
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= WIDE_ENOUGH_TO_SHIFT_PX);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isWide;
}

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
export function ZoomControls({ mapRef, drawerOpen = false }: ZoomControlsProps): ReactElement {
  const isWideEnoughToShift = useIsWideEnoughToShift();
  const shifted = drawerOpen && isWideEnoughToShift;
  const style: CSSProperties = { ...wrapStyle, right: shifted ? DRAWER_MAX_WIDTH + GUTTER : GUTTER };
  return (
    <div data-zoom-controls data-floating-control style={style}>
      <button type="button" style={buttonStyle} onClick={() => mapRef.current?.zoomIn()}>
        Zoom in
      </button>
      <button type="button" style={buttonStyle} onClick={() => mapRef.current?.zoomOut()}>
        Zoom out
      </button>
      <button type="button" style={buttonStyle} onClick={() => mapRef.current?.fit()}>
        Fit
      </button>
    </div>
  );
}
