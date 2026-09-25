import { type RefObject, useEffect, useState } from "react";

/**
 * The element's rendered height, padding and border included, kept live by
 * a `ResizeObserver` — `0` until the first report. The demo's top bar wraps
 * onto more rows on a narrow screen, so its height is measured, never
 * assumed; the right-side sheets start below it (2026-09-25 browser review:
 * an open drawer or tuning panel covered the corpus picker and the Tuning
 * button at 1440 and 768).
 */
export function useBorderBoxHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      setHeight(box ? box.blockSize : entry.target.getBoundingClientRect().height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}
