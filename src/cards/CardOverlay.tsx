import type { ReactElement, ReactNode } from "react";
import type { MapNode } from "../shared/spec";
import { DEFAULT_THEME, type Theme } from "../shared/theme";
import type { SelectedCardPlacement } from "./placeSelectedCard";

/** The library's own default card frame size, also `CorpusMap`'s default for `cardSize`. */
export const DEFAULT_CARD_SIZE = { width: 160, height: 56 };

/** The card frame's left edge in the node's territory colour, tying a card to its region (spec slice D §4). */
export const CARD_STRIPE_WIDTH = 4;

/** The card frame's top, right and bottom border; `cardSizeFor` counts it with the stripe. */
export const CARD_BORDER_WIDTH = 1;

export interface CardOverlayProps {
  /** The selected item; the overlay renders its one card. */
  node: MapNode;
  placement: SelectedCardPlacement;
  /** The overlay's opacity, card and leader together; the map fades it with the points. Defaults to 1. */
  opacity?: number | undefined;
  /** Frame size. Defaults to `DEFAULT_CARD_SIZE` (160x56). */
  cardSize?: { width: number; height: number } | undefined;
  theme?: Pick<Theme, "cardBackground" | "cardBorder" | "pointNeutral" | "edge" | "territoryLabel"> | undefined;
  /** Each territory's painted colour (`Scene.colours`); a card whose node has none gets `theme.pointNeutral`. */
  colours?: ReadonlyMap<string, string> | undefined;
  renderCard: (node: MapNode) => ReactNode;
}

// The card is decorative: `aria-hidden` removes it from the accessibility
// tree, and `inert` removes anything focusable a consumer put inside it
// from the tab order (and from hit-testing — which is why clicks are
// resolved by `CorpusMap` on the map surface, not here). Set through the
// DOM rather than JSX so it also works on React 18, which does not know the
// attribute.
function markInert(element: HTMLDivElement | null): void {
  element?.setAttribute("inert", "");
}

export function CardOverlay({
  node,
  placement,
  opacity = 1,
  cardSize = DEFAULT_CARD_SIZE,
  theme = DEFAULT_THEME,
  colours,
  renderCard,
}: CardOverlayProps): ReactElement {
  const stripe = (node.territory === null ? undefined : colours?.get(node.territory)) ?? theme.pointNeutral;
  const { leader } = placement;
  return (
    <div ref={markInert} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity }}>
      {leader ? (
        <svg
          data-card-leader=""
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          <line
            x1={leader.from[0]}
            y1={leader.from[1]}
            x2={leader.to[0]}
            y2={leader.to[1]}
            stroke={theme.edge ?? theme.territoryLabel}
            strokeWidth={1}
          />
        </svg>
      ) : null}
      <div
        data-card={node.id}
        style={{
          position: "absolute",
          left: placement.left,
          top: placement.top,
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
        {renderCard(node)}
      </div>
    </div>
  );
}
