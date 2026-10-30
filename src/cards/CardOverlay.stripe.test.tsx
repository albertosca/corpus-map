import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MapNode } from "../shared/spec";
import { DEFAULT_THEME } from "../shared/theme";
import { CardOverlay } from "./CardOverlay";

const inTerritory: MapNode = { id: "a", label: "A", x: 0, y: 0, territory: "t" };
const withoutTerritory: MapNode = { id: "b", label: "B", x: 300, y: 0, territory: null };

/** `colour` as jsdom normalises it inside a `style` (hex becomes `rgb(...)`). */
function normalised(colour: string): string {
  const probe = document.createElement("div");
  probe.style.color = colour;
  return probe.style.color;
}

function card(node: MapNode, colours?: ReadonlyMap<string, string>) {
  const { container } = render(
    <CardOverlay
      node={node}
      placement={{ left: 0, top: 0, leader: null }}
      colours={colours}
      renderCard={(each) => each.label}
    />,
  );
  return container.querySelector<HTMLElement>(`[data-card="${node.id}"]`);
}

describe("card territory stripe", () => {
  it("draws a 4 px left stripe in the node's territory colour, and a 1 px frame elsewhere", () => {
    const frame = card(inTerritory, new Map([["t", "#003c96"]]));
    expect(frame?.style.borderLeft).toBe(`4px solid ${normalised("#003c96")}`);
    expect(frame?.style.borderTop).toBe(`1px solid ${normalised(DEFAULT_THEME.cardBorder)}`);
  });

  it("uses pointNeutral for a node without territory, or when no colour is known", () => {
    expect(card(withoutTerritory, new Map([["t", "#003c96"]]))?.style.borderLeft).toBe(
      `4px solid ${normalised(DEFAULT_THEME.pointNeutral)}`,
    );
    expect(card(inTerritory)?.style.borderLeft).toBe(`4px solid ${normalised(DEFAULT_THEME.pointNeutral)}`);
  });
});
