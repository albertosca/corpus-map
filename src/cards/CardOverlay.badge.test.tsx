import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MapNode, MapSpec } from "../shared/spec";
import { DEFAULT_THEME } from "../shared/theme";
import { type CardContext, CardOverlay } from "./CardOverlay";

/** `colour` as jsdom normalises it inside a `style` (hex becomes `rgb(...)`). */
function normalised(colour: string): string {
  const probe = document.createElement("div");
  probe.style.color = colour;
  return probe.style.color;
}

describe("CardOverlay group badge", () => {
  // A card sized exactly to its content (as `cardSizeFor` sizes it) leaves
  // no room under the renderer's block, and the frame clips its overflow: a
  // badge in the normal flow would sit below the content, out of sight.
  it("sits in the frame's top-right corner, out of the flow, on the card's own background", () => {
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: Array.from({ length: 3 }, (_unused, index) => ({
        id: `g${index}`,
        label: `G${index}`,
        x: 0,
        y: 0,
        territory: null,
      })),
    };
    const { container } = render(
      <CardOverlay
        spec={spec}
        viewport={{ scale: 1, tx: 0, ty: 0 }}
        regime="near"
        cap={200}
        width={60}
        height={60}
        cardSize={{ width: 50, height: 50 }}
        renderCard={(node) => <div style={{ height: 48 }}>{node.label}</div>}
      />,
    );
    const badge = container.querySelector<HTMLElement>("[data-group-badge]");
    expect(badge?.textContent).toBe("+2");
    expect(badge?.style.position).toBe("absolute");
    expect(badge?.style.top).toBe("0px");
    expect(badge?.style.right).toBe("0px");
    expect(badge?.style.background).toBe(normalised(DEFAULT_THEME.cardBackground));
  });
});

// Same arrangement as CardOverlay.test.tsx's group badge test: in a 60x60 box
// with a 50x50 frame, nodes at one point collapse into a single card.
function specAt(count: number): MapSpec {
  return {
    version: "1",
    territories: [],
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `g${index}`,
      label: `G${index}`,
      x: 0,
      y: 0,
      territory: null,
    })),
  };
}

function contextsFor(count: number): CardContext[] {
  const seen: CardContext[] = [];
  const renderCard = (node: MapNode, context: CardContext) => {
    seen.push(context);
    return <div>{node.label}</div>;
  };
  render(
    <CardOverlay
      spec={specAt(count)}
      viewport={{ scale: 1, tx: 0, ty: 0 }}
      regime="near"
      cap={200}
      width={60}
      height={60}
      cardSize={{ width: 50, height: 50 }}
      renderCard={renderCard}
    />,
  );
  return seen;
}

describe("CardOverlay's card context", () => {
  it("tells the renderer the number its group badge shows, so it can keep its text clear of the corner", () => {
    expect(contextsFor(4)).toEqual([{ badgeCount: 3 }]);
  });

  it("tells a lone card's renderer there is no badge", () => {
    expect(contextsFor(1)).toEqual([{ badgeCount: 0 }]);
  });
});
