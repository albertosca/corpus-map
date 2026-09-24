import type { CorpusMapView } from "corpus-map";
import type { CSSProperties, ReactElement } from "react";

interface IndicatorProps {
  view: CorpusMapView | null;
}

// Mirrors the library's internal Minimap (not exported publicly, spec 4
// §1): a 160x110 canvas with a 12px corner margin
// (`src/minimap/Minimap.tsx`). The indicator sits in the same bottom-left
// corner, stacked above it with a matching gap, rather than asking the
// library for a size it deliberately keeps private.
const MINIMAP_HEIGHT = 110;
const MINIMAP_MARGIN = 12;
const GAP = 12;

const style: CSSProperties = {
  position: "fixed",
  left: MINIMAP_MARGIN,
  bottom: MINIMAP_MARGIN + MINIMAP_HEIGHT + GAP,
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
 * "regime · ratio× · N items", bottom-left above the minimap (spec 4 §2),
 * read straight from `CorpusMap`'s own `onViewChange` payload — nothing
 * computed here.
 */
export function Indicator({ view }: IndicatorProps): ReactElement | null {
  if (!view) return null;
  return (
    <div data-indicator style={style}>
      {view.regime} · {view.ratio.toFixed(1)}× · {view.visibleCount} items
    </div>
  );
}
