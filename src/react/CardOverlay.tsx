import type { JSX, ReactNode } from "react";
import type { Regime } from "../lod";
import type { MapNode, MapSpec } from "../spec";
import { toScreen, type Viewport } from "../viewport";

export interface CardOverlayProps {
  spec: MapSpec;
  viewport: Viewport;
  regime: Regime;
  cap: number;
  width: number;
  height: number;
  renderCard: (node: MapNode) => ReactNode;
  onSelect?: (node: MapNode) => void;
}

export function CardOverlay({
  spec,
  viewport,
  regime,
  cap,
  width,
  height,
  renderCard,
  onSelect,
}: CardOverlayProps): JSX.Element | null {
  if (regime !== "near") return null;

  const onScreen: Array<{ node: MapNode; x: number; y: number }> = [];
  for (const n of spec.nodes) {
    const [x, y] = toScreen(viewport, n.x, n.y);
    if (x >= 0 && x <= width && y >= 0 && y <= height) {
      onScreen.push({ node: n, x, y });
    }
  }

  // The cap is a hard rule, not a heuristic: it is what keeps the DOM
  // bounded regardless of corpus size or how far out the user zooms with a
  // dense territory open. Applied after the on-screen filter, so it only
  // ever trims what the user could actually see, not an arbitrary prefix of
  // the spec. Above the cap, the canvas alone carries the field.
  const shown = onScreen.slice(0, cap);

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {shown.map(({ node, x, y }) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: decorative, mouse-only click target inside an aria-hidden overlay; the accessible tree carries keyboard interaction.
        // biome-ignore lint/a11y/useKeyWithClickEvents: decorative, mouse-only click target inside an aria-hidden overlay; the accessible tree carries keyboard interaction.
        <div
          key={node.id}
          data-card={node.id}
          onClick={() => onSelect?.(node)}
          style={{ position: "absolute", left: x, top: y, pointerEvents: "auto" }}
        >
          {renderCard(node)}
        </div>
      ))}
    </div>
  );
}
