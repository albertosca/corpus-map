import type { ReactElement } from "react";
import type { Regime } from "../lod/lod";
import { visibleNodes } from "../lod/visible";
import type { MapNode, MapSpec, Territory } from "../shared/spec";
import type { Viewport } from "../viewport/viewport";

export interface AccessibleTreeProps {
  spec: MapSpec;
  regime: Regime;
  viewport: Viewport;
  width: number;
  height: number;
  cap: number;
  onFocusTerritory?: ((territory: Territory) => void) | undefined;
  onSelect?: ((node: MapNode) => void) | undefined;
}

const UNASSIGNED = "Unassigned";

// One string per regime, so a far→mid change is announced too — the tree's
// items do not change between those two, only what the canvas shows.
const ANNOUNCEMENT: Record<Regime, string> = {
  far: "Showing territories",
  mid: "Showing territories and points",
  near: "Showing individual items",
};

/**
 * The canvas is decorative; this is the content. It mirrors the current
 * regime rather than the corpus, which is what keeps it bounded: ~10
 * territories at the far/mid regime, and at the near regime only the nodes
 * that are on screen, capped at `cap` — the same bound `CardOverlay` uses
 * for its cards. A corpus of ten thousand items never produces a tree of
 * ten thousand elements.
 */
export function AccessibleTree({
  spec,
  regime,
  viewport,
  width,
  height,
  cap,
  onFocusTerritory,
  onSelect,
}: AccessibleTreeProps): ReactElement {
  const loose = spec.nodes.filter((n) => n.territory === null);

  return (
    <div style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
      <div role="status" aria-live="polite">
        {ANNOUNCEMENT[regime]}
      </div>
      {regime === "near" ? (
        <ul>
          {visibleNodes(spec, viewport, width, height, cap).map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => onSelect?.(n)}>
                {n.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul>
          {spec.territories.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onFocusTerritory?.(t)}>
                {t.name} ({t.members.length})
              </button>
            </li>
          ))}
          {loose.length > 0 && (
            <li>
              {UNASSIGNED} ({loose.length})
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
