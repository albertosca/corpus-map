import { useEffect, useState } from "react";

/**
 * `window.innerWidth`, read once at mount (a client-only demo, never
 * server-rendered, so there is no hydration mismatch to guard against) and
 * kept live across a real browser resize. Shared with `ZoomControls`, `Footer` and `App`; it lives here, a leaf
 * module, because `Drawer` needs it and `ZoomControls` imports `Drawer`.
 */
export function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

/** Below this window width the demo switches to its phone layout (spec mobile §6). */
export const NARROW_WINDOW_WIDTH = 600;

/** A finger's target on a narrow window: every control is at least this tall, in CSS pixels (spec mobile §6). */
export const TOUCH_TARGET_SIZE = 44;

/** Whether the window is narrower than `NARROW_WINDOW_WIDTH`, kept live across a resize. */
export function useNarrowWindow(): boolean {
  return useViewportWidth() < NARROW_WINDOW_WIDTH;
}

/**
 * `window.innerHeight`, kept live across a resize: the sheet's collapsed
 * height and the map's bottom inset follow it. Pixels from `innerHeight`
 * rather than `vh`, which on a phone's browser is the height with its
 * toolbars hidden and so overstates what is visible.
 */
export function useViewportHeight(): number {
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return height;
}

/** The collapsed sheet's visible height: 40% of the window's, in whole pixels (spec mobile §6). */
export function sheetCollapsedHeight(windowHeight: number): number {
  return Math.round(0.4 * windowHeight);
}
