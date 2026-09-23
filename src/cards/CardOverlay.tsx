import type { ReactElement, ReactNode } from "react";
import type { Regime } from "../lod/lod";
import { visibleNodes } from "../lod/visible";
import type { MapNode, MapSpec } from "../shared/spec";
import { DEFAULT_THEME, type Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";
import { type CardAnchor, layoutCards } from "./layout";

/** The library's own default card frame size, also `CorpusMap`'s default for `cardSize`. */
export const DEFAULT_CARD_SIZE = { width: 160, height: 56 };

export interface CardOverlayProps {
  spec: MapSpec;
  viewport: Viewport;
  regime: Regime;
  cap: number;
  width: number;
  height: number;
  /** Frame size passed to `layoutCards`. Defaults to `DEFAULT_CARD_SIZE` (160x56). */
  cardSize?: { width: number; height: number } | undefined;
  /** Zoom-driven fade for the whole overlay; the LOD cross-fade at the near threshold (Task 7 wires it in). */
  opacity?: number | undefined;
  theme?: Pick<Theme, "cardBackground" | "cardBorder"> | undefined;
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
  cardSize = DEFAULT_CARD_SIZE,
  opacity = 1,
  theme = DEFAULT_THEME,
  renderCard,
}: CardOverlayProps): ReactElement | null {
  if (regime !== "near") return null;

  const shown = visibleNodes(spec, viewport, width, height, cap);
  const byId = new Map(shown.map((n) => [n.id, n]));
  const anchors: CardAnchor[] = shown.map((n) => {
    const [x, y] = toScreen(viewport, n.x, n.y);
    return { id: n.id, x, y };
  });
  const placed = layoutCards(anchors, cardSize, { width, height });

  return (
    <div ref={markInert} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity }}>
      {placed.map((card) => {
        // `layoutCards` never returns an empty `ids`, and every id in it is
        // one of `shown`'s own ids — either the anchor's own id, or one it
        // absorbed into an already-placed card — both of which `byId` was
        // just built from.
        const firstId = card.ids[0] as string;
        const first = byId.get(firstId) as MapNode;
        return (
          <div
            key={firstId}
            data-card={firstId}
            data-card-count={card.ids.length}
            style={{
              position: "absolute",
              left: card.x,
              top: card.y,
              width: cardSize.width,
              height: cardSize.height,
              boxSizing: "border-box",
              background: theme.cardBackground,
              border: `1px solid ${theme.cardBorder}`,
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {renderCard(first)}
            {card.ids.length > 1 ? <span data-group-badge="">{`+${card.ids.length - 1}`}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
