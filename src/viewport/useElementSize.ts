import { type RefObject, useEffect, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * The size of `elementReference`'s element, from a `ResizeObserver`; `null` until the
 * first observation. A report equal to the current size never calls
 * `setSize` at all, so no render is ever scheduled for it — checked against
 * `sizeReference`, not the `size` state variable, because a same-reference-
 * returning functional update is only an optimization, not a guarantee:
 * measured empirically while building this hook (against the CorpusMap
 * frame-coalescing test's own technique of counting Profiler commits, not
 * renders — a render-body counter would have missed it), React still
 * re-commits a second, separate dispatch of an identical value once a real
 * state change has already committed before it. `sizeReference` is written
 * synchronously in this same callback, right where `size` is decided, rather
 * than through a `[size]`-keyed effect like `CorpusMap`'s `hoverReference` (which
 * needs one, since `hover` there has more than one writer): `size` has
 * exactly one writer, this callback, so there is no other update this ref
 * could fall behind.
 */
export function useElementSize(elementReference: RefObject<HTMLElement | null>): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null);
  const sizeReference = useRef<ElementSize | null>(null);

  useEffect(() => {
    const element = elementReference.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const previous = sizeReference.current;
      if (previous && previous.width === width && previous.height === height) return;
      sizeReference.current = { width, height };
      setSize(sizeReference.current);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementReference]);

  return size;
}
