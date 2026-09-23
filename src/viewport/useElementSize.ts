import { type RefObject, useEffect, useRef, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * The size of `ref`'s element, from a `ResizeObserver`; `null` until the
 * first observation. A report equal to the current size never calls
 * `setSize` at all, so no render is ever scheduled for it — checked against
 * `sizeRef`, not the `size` state variable, because a same-reference-
 * returning functional update is only an optimization, not a guarantee:
 * measured empirically while building this hook (against the CorpusMap
 * frame-coalescing test's own technique of counting Profiler commits, not
 * renders — a render-body counter would have missed it), React still
 * re-commits a second, separate dispatch of an identical value once a real
 * state change has already committed before it. `sizeRef` is written
 * synchronously in this same callback, right where `size` is decided, rather
 * than through a `[size]`-keyed effect like `CorpusMap`'s `hoverRef` (which
 * needs one, since `hover` there has more than one writer): `size` has
 * exactly one writer, this callback, so there is no other update this ref
 * could fall behind.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null);
  const sizeRef = useRef<ElementSize | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const prev = sizeRef.current;
      if (prev && prev.width === width && prev.height === height) return;
      sizeRef.current = { width, height };
      setSize(sizeRef.current);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}
