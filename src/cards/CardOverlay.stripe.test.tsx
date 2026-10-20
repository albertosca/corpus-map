import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { validateSpec } from "../shared/spec";
import { DEFAULT_THEME } from "../shared/theme";
import { CardOverlay } from "./CardOverlay";

const spec = validateSpec({
  version: "1",
  territories: [{ id: "t", name: "T", members: ["a"], centroid: [0, 0] }],
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, territory: "t" },
    { id: "b", label: "B", x: 300, y: 0, territory: null },
  ],
});

/** `colour` as jsdom normalises it inside a `style` (hex becomes `rgb(...)`). */
function normalised(colour: string): string {
  const probe = document.createElement("div");
  probe.style.color = colour;
  return probe.style.color;
}

function cards(colours?: ReadonlyMap<string, string>) {
  const { container } = render(
    <CardOverlay
      spec={spec}
      viewport={{ scale: 1, tx: 100, ty: 150 }}
      regime="near"
      cap={10}
      width={600}
      height={300}
      colours={colours}
      renderCard={(node) => node.label}
    />,
  );
  return (id: string) => container.querySelector<HTMLElement>(`[data-card="${id}"]`);
}

describe("card territory stripe", () => {
  it("draws a 4 px left stripe in the node's territory colour, and a 1 px frame elsewhere", () => {
    const card = cards(new Map([["t", "#003c96"]]))("a");
    expect(card?.style.borderLeft).toBe(`4px solid ${normalised("#003c96")}`);
    expect(card?.style.borderTop).toBe(`1px solid ${normalised(DEFAULT_THEME.cardBorder)}`);
  });

  it("uses pointNeutral for a node without territory, or when no colour is known", () => {
    const find = cards();
    expect(find("b")?.style.borderLeft).toBe(`4px solid ${normalised(DEFAULT_THEME.pointNeutral)}`);
    expect(find("a")?.style.borderLeft).toBe(`4px solid ${normalised(DEFAULT_THEME.pointNeutral)}`);
  });
});
