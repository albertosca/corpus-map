import type { JSX, ReactNode } from "react";
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

  const shown = visibleNodes(spec, viewport, width, height, cap);

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {shown.map((node) => {
        const [x, y] = toScreen(viewport, node.x, node.y);
        return (
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
        );
      })}
    </div>
  );
}
