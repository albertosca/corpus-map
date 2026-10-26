import type { ReactElement, ReactNode } from "react";
import type { Regime } from "../lod/lod";
import { visibleNodes } from "../lod/visible";
import type { MapNode, MapSpec } from "../shared/spec";
import { DEFAULT_THEME, type Theme } from "../shared/theme";
import { toScreen, type Viewport } from "../viewport/viewport";
import { type CardAnchor, layoutCards } from "./layout";

/** The library's own default card frame size, also `CorpusMap`'s default for `cardSize`. */
export const DEFAULT_CARD_SIZE = { width: 160, height: 56 };

/** The card frame's left edge in the node's territory colour, tying a card to its region (spec slice D §4). */
export const CARD_STRIPE_WIDTH = 4;

/** The card frame's top, right and bottom border; `cardSizeFor` counts it with the stripe. */
export const CARD_BORDER_WIDTH = 1;

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
  theme?: Pick<Theme, "cardBackground" | "cardBorder" | "pointNeutral"> | undefined;
  /** Each territory's painted colour (`Scene.colours`); a card whose node has none gets `theme.pointNeutral`. */
  colours?: ReadonlyMap<string, string> | undefined;
  renderCard: (node: MapNode) => ReactNode;
}

// Cards are decorative: `aria-hidden` removes them from the accessibility
// tree, and `inert` removes anything focusable a consumer put inside them
// from the tab order (and from hit-testing — which is why clicks are
// resolved by `CorpusMap` on the map surface, not here). Set through the
// DOM rather than JSX so it also works on React 18, which does not know the
// attribute.
function markInert(element: HTMLDivElement | null): void {
  element?.setAttribute("inert", "");
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
  colours,
  renderCard,
}: CardOverlayProps): ReactElement | null {
  if (regime !== "near") return null;

  const shown = visibleNodes(spec, viewport, width, height, cap);
  const byId = new Map(shown.map((node) => [node.id, node]));
  const anchors: CardAnchor[] = shown.map((node) => {
    const [horizontal, vertical] = toScreen(viewport, node.x, node.y);
    return { id: node.id, x: horizontal, y: vertical };
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
        const stripe = (first.territory === null ? undefined : colours?.get(first.territory)) ?? theme.pointNeutral;
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
              borderTop: `${CARD_BORDER_WIDTH}px solid ${theme.cardBorder}`,
              borderRight: `${CARD_BORDER_WIDTH}px solid ${theme.cardBorder}`,
              borderBottom: `${CARD_BORDER_WIDTH}px solid ${theme.cardBorder}`,
              borderLeft: `${CARD_STRIPE_WIDTH}px solid ${stripe}`,
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {renderCard(first)}
            {/* Out of the flow, in the corner: a frame sized exactly to its content (as
                `cardSizeFor` sizes it) clips anything placed below the renderer's block. */}
            {card.ids.length > 1 ? (
              <span
                data-group-badge=""
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  padding: "0 4px",
                  background: theme.cardBackground,
                  borderBottomLeftRadius: 4,
                }}
              >{`+${card.ids.length - 1}`}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
