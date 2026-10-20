import { type RefObject, useLayoutEffect, useState } from "react";

/**
 * The element's rendered height, padding and border included: read once
 * before the first paint, then kept live by a `ResizeObserver`. The demo's
 * top bar wraps onto more rows on a narrow screen, so its height is
 * measured, never assumed; the map and the right-side sheets start below it
 * (2026-09-25 browser review: an open drawer or tuning panel covered the
 * corpus picker and the Tuning button at 1440 and 768). The first read is
 * synchronous because the observer reports in the same frame as the map's
 * own: a map that measured its box before the bar did kept the taller
 * box's scale instead of the fitted one (slice D browser check).
 */
export function useBorderBoxHeight(reference: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = reference.current;
    if (!element) return;
    // A layout read before paint is the one setState-in-effect React documents
    // as intended (useLayoutEffect's measuring example); deferring it to the
    // observer is the frame-late fit this read exists to prevent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeight(element.getBoundingClientRect().height);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      setHeight(box ? box.blockSize : entry.target.getBoundingClientRect().height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [reference]);
  return height;
}
