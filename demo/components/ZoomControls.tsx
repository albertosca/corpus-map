import type { CorpusMapHandle } from "corpus-map";
import type { CSSProperties, ReactElement, RefObject } from "react";

interface ZoomControlsProps {
  mapRef: RefObject<CorpusMapHandle | null>;
}

const wrapStyle: CSSProperties = {
  position: "fixed",
  right: 12,
  bottom: 12,
  zIndex: 10,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const buttonStyle: CSSProperties = {
  width: 84,
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid rgba(0,0,0,0.2)",
  background: "rgba(255,255,255,0.92)",
  color: "#1a1d23",
  fontSize: 13,
};

/**
 * Zoom in / zoom out / fit, bottom-right (spec 4 §2), driving the library's
 * own imperative handle (`CorpusMapHandle`, showcase Task 3) rather than any
 * zoom logic of its own. A no-op before the map has attached its handle.
 */
export function ZoomControls({ mapRef }: ZoomControlsProps): ReactElement {
  return (
    <div data-zoom-controls data-floating-control style={wrapStyle}>
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
