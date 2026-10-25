import { memo, type ReactElement } from "react";
import { OVERLAY_LAYER } from "../shared/corner";
import type { Theme } from "../shared/theme";
import { type EdgeMarker, MARKER_FONT, MARKER_HEIGHT } from "./markers";

/**
 * The off-screen neighbour markers, above the cards. Hidden from assistive
 * technology (the related list carries the same items) and transparent to
 * the pointer: the surface resolves presses with `markerAt`.
 */
export const EdgeMarkers = memo(function EdgeMarkers({
  markers,
  theme,
}: {
  markers: readonly EdgeMarker[];
  theme: Pick<Theme, "hoverBackground" | "hoverText">;
}): ReactElement | null {
  if (markers.length === 0) return null;
  return (
    <div
      data-edge-markers=""
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: OVERLAY_LAYER }}
    >
      {markers.map((marker) => (
        <div
          key={marker.id}
          data-edge-marker={marker.id}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            transform: `translate(${marker.left}px, ${marker.top}px)`,
            width: marker.width,
            height: MARKER_HEIGHT,
            font: MARKER_FONT,
            lineHeight: `${MARKER_HEIGHT}px`,
            padding: "0 8px",
            background: theme.hoverBackground,
            color: theme.hoverText,
            borderRadius: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            boxSizing: "border-box",
          }}
        >
          {marker.label}
        </div>
      ))}
    </div>
  );
});
