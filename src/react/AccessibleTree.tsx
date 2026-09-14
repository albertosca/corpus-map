import type { JSX } from "react";
import type { Regime } from "../lod";
import type { MapNode, MapSpec, Territory } from "../spec";

export interface AccessibleTreeProps {
  spec: MapSpec;
  regime: Regime;
  onFocusTerritory?: (territory: Territory) => void;
  onSelect?: (node: MapNode) => void;
}

const UNASSIGNED = "Unassigned";

/**
 * The canvas is decorative; this is the content. It mirrors the current
 * regime rather than the corpus, which is what keeps it bounded: ~10 nodes at
 * the far regime, ~100 inside a territory. A corpus of ten thousand items
 * never produces a tree of ten thousand elements.
 */
export function AccessibleTree({ spec, regime, onFocusTerritory, onSelect }: AccessibleTreeProps): JSX.Element {
  const loose = spec.nodes.filter((n) => n.territory === null);
  const announcement = regime === "near" ? "Showing individual items" : "Showing territories";

  return (
    <div style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
      <div role="status" aria-live="polite">
        {announcement}
      </div>
      {regime === "near" ? (
        <ul>
          {spec.nodes.map((n) => (
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
              <button type="button">
                {UNASSIGNED} ({loose.length})
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
