import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MapNode } from "../shared/spec";
import { DEFAULT_THEME } from "../shared/theme";
import { CardOverlay } from "./CardOverlay";

const node: MapNode = { id: "a", label: "A", x: 0, y: 0, territory: null };

function overlay(extra: Partial<Parameters<typeof CardOverlay>[0]> = {}) {
  return render(
    <CardOverlay
      node={node}
      placement={{ left: 120, top: 40, leader: null }}
      renderCard={(each) => <span>{each.label}</span>}
      {...extra}
    />,
  );
}

describe("CardOverlay", () => {
  it("renders one card for the node at the placement's left and top", () => {
    const { container } = overlay();
    const cards = container.querySelectorAll<HTMLElement>("[data-card]");
    expect(cards).toHaveLength(1);
    expect(cards[0]?.getAttribute("data-card")).toBe("a");
    expect(cards[0]?.style.left).toBe("120px");
    expect(cards[0]?.style.top).toBe("40px");
    expect(cards[0]?.textContent).toBe("A");
  });

  it("is hidden from assistive technology and inert", () => {
    const { container } = overlay();
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.hasAttribute("inert")).toBe(true);
  });

  it("draws no leader when the placement has none", () => {
    const { container } = overlay();
    expect(container.querySelector("[data-card-leader]")).toBeNull();
  });

  it("draws the leader in theme.edge from its start to its end", () => {
    const { container } = overlay({
      placement: { left: 300, top: 200, leader: { from: [400, 252], to: [350, 212] } },
      theme: { ...DEFAULT_THEME, edge: "#123456" },
    });
    const line = container.querySelector("[data-card-leader] line");
    expect(line?.getAttribute("x1")).toBe("400");
    expect(line?.getAttribute("y1")).toBe("252");
    expect(line?.getAttribute("x2")).toBe("350");
    expect(line?.getAttribute("y2")).toBe("212");
    expect(line?.getAttribute("stroke")).toBe("#123456");
  });

  it("strokes the leader in territoryLabel when the theme has no edge colour", () => {
    const { edge: _edge, ...withoutEdge } = DEFAULT_THEME;
    const { container } = overlay({
      placement: { left: 300, top: 200, leader: { from: [400, 252], to: [350, 212] } },
      theme: { ...withoutEdge, territoryLabel: "#654321" },
    });
    expect(container.querySelector("[data-card-leader] line")?.getAttribute("stroke")).toBe("#654321");
  });

  it("calls renderCard with the node alone", () => {
    const renderCard = vi.fn((each: MapNode) => each.label);
    overlay({ renderCard });
    expect(renderCard).toHaveBeenCalledTimes(1);
    expect(renderCard.mock.calls[0]).toEqual([node]);
  });
});
