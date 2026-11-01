import type { CorpusMapView } from "corpus-map";
import { type CSSProperties, type ReactElement, useSyncExternalStore } from "react";
import { token } from "../tokens";
import { INDICATOR_BOTTOM, INDICATOR_LEFT } from "./floatingLayout";

/**
 * The last view `CorpusMap` reported, held outside React state so a view
 * change re-renders only the indicator: kept in `App`'s state, every drag
 * frame that moved a point across the edge committed the whole demo twice
 * (bench/commit.test.tsx).
 */
export interface ViewStore {
  get: () => CorpusMapView | null;
  set: (view: CorpusMapView | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createViewStore(): ViewStore {
  let current: CorpusMapView | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (view) => {
      current = view;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

interface IndicatorProps {
  store: ViewStore;
  /** In flow inside the narrow window's bottom strip (spec mobile §6): no position, box or chip of its own. */
  inline?: boolean | undefined;
}

// Sits in the library minimap's bottom-left corner, stacked above it with
// one gutter between them. The minimap's size and margin come from
// `floatingLayout.ts`, the demo's one copy of that private geometry, which
// `ZoomControls` and the collision test read too.
const style: CSSProperties = {
  position: "fixed",
  left: INDICATOR_LEFT,
  bottom: INDICATOR_BOTTOM,
  zIndex: 10,
  maxWidth: "55vw",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  padding: "4px 10px",
  borderRadius: 4,
  background: token("surface"),
  border: `1px solid ${token("border")}`,
  color: token("text"),
  fontSize: 13,
};

/**
 * "regime · ratio× · N items" ("1 item" for one), bottom-left above the minimap (spec 4 §2),
 * read straight from `CorpusMap`'s own `onViewChange` payload — nothing
 * computed here.
 */
/** One line that never wraps, beside the credit in the strip; the strip carries the text size and the surface. */
const inlineStyle: CSSProperties = {
  flex: "0 0 auto",
  whiteSpace: "nowrap",
};

export function Indicator({ store, inline = false }: IndicatorProps): ReactElement | null {
  const view = useSyncExternalStore(store.subscribe, store.get);
  if (!view) return null;
  return (
    <div data-indicator {...(inline ? {} : { "data-floating-control": "" })} style={inline ? inlineStyle : style}>
      {view.regime} · {view.ratio.toFixed(1)}× · {view.visibleCount} {view.visibleCount === 1 ? "item" : "items"}
    </div>
  );
}
