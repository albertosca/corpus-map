import type { CorpusMapView } from "corpus-map";
import type { CSSProperties, ReactElement } from "react";
import { INDICATOR_BOTTOM, INDICATOR_LEFT } from "./floatingLayout";

interface IndicatorProps {
  view: CorpusMapView | null;
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
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.10)",
  color: "#1a1d23",
  fontSize: 13,
};

/**
 * "regime · ratio× · N items" ("1 item" for one), bottom-left above the minimap (spec 4 §2),
 * read straight from `CorpusMap`'s own `onViewChange` payload — nothing
 * computed here.
 */
export function Indicator({ view }: IndicatorProps): ReactElement | null {
  if (!view) return null;
  return (
    <div data-indicator data-floating-control style={style}>
      {view.regime} · {view.ratio.toFixed(1)}× · {view.visibleCount} {view.visibleCount === 1 ? "item" : "items"}
    </div>
  );
}
