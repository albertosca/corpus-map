import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
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
  /** Reports the id of the territory whose button gains keyboard focus, and `null` when it loses it. */
  onTerritoryFocusChange?: ((id: string | null) => void) | undefined;
  /** Reports the id of the item whose button gains keyboard focus (near regime), and `null` when it loses it. */
  onNodeFocusChange?: ((id: string | null) => void) | undefined;
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
  onTerritoryFocusChange,
  onNodeFocusChange,
}: AccessibleTreeProps): ReactElement {
  const loose = spec.nodes.filter((node) => node.territory === null);

  // The buttons are visually hidden, so `CorpusMap` draws their focus on the
  // canvas; it learns which one from focus/blur here. A focused button that
  // unmounts (the regime changed, or its item left the listed set) fires no
  // blur, so after every render a reported focus that is no longer inside
  // this tree is withdrawn too — otherwise a stale highlight would stay drawn.
  const rootReference = useRef<HTMLDivElement>(null);
  const reported = useRef(false);
  useEffect(() => {
    if (!reported.current) return;
    if (rootReference.current?.contains(document.activeElement)) return;
    reported.current = false;
    onTerritoryFocusChange?.(null);
    onNodeFocusChange?.(null);
  });
  const territoryFocus = (id: string | null) => {
    reported.current = id !== null;
    onTerritoryFocusChange?.(id);
  };
  const nodeFocus = (id: string | null) => {
    reported.current = id !== null;
    onNodeFocusChange?.(id);
  };

  return (
    <div
      ref={rootReference}
      style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
    >
      <div role="status" aria-live="polite">
        {ANNOUNCEMENT[regime]}
      </div>
      {regime === "near" ? (
        <ul>
          {visibleNodes(spec, viewport, width, height, cap).map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onSelect?.(node)}
                onFocus={() => nodeFocus(node.id)}
                onBlur={() => nodeFocus(null)}
              >
                {node.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul>
          {spec.territories.map((territory) => (
            <li key={territory.id}>
              <button
                type="button"
                onClick={() => onFocusTerritory?.(territory)}
                onFocus={() => territoryFocus(territory.id)}
                onBlur={() => territoryFocus(null)}
              >
                {territory.name} ({territory.members.length})
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
