import type { ReactElement, ReactNode } from "react";
import type { Regime } from "../lod";
import type { MapNode, MapSpec } from "../spec";
import { toScreen, type Viewport } from "../viewport";
import { visibleNodes } from "./visible";

export interface CardOverlayProps {
  spec: MapSpec;
  viewport: Viewport;
  regime: Regime;
  cap: number;
  width: number;
  height: number;
  renderCard: (node: MapNode) => ReactNode;
}

// Cards are decorative: `aria-hidden` removes them from the accessibility
// tree, and `inert` removes anything focusable a consumer put inside them
// from the tab order (and from hit-testing — which is why clicks are
// resolved by `CorpusMap` on the map surface, not here). Set through the
// DOM rather than JSX so it also works on React 18, which does not know the
// attribute.
function markInert(el: HTMLDivElement | null): void {
  el?.setAttribute("inert", "");
}

export function CardOverlay({
  spec,
  viewport,
  regime,
  cap,
  width,
  height,
  renderCard,
}: CardOverlayProps): ReactElement | null {
  if (regime !== "near") return null;

  const shown = visibleNodes(spec, viewport, width, height, cap);

  return (
    <div ref={markInert} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {shown.map((node) => {
        const [x, y] = toScreen(viewport, node.x, node.y);
        return (
          <div key={node.id} data-card={node.id} style={{ position: "absolute", left: x, top: y }}>
            {renderCard(node)}
          </div>
        );
      })}
    </div>
  );
}
