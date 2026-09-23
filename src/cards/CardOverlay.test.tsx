import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MapSpec } from "../shared/spec";
import { CardOverlay } from "./CardOverlay";

const many = (n: number): MapSpec => ({
  version: "1",
  territories: [],
  nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `N${i}`, x: i * 0.001, y: 0, territory: null })),
});

const vp = { scale: 10, tx: 0, ty: 0 };

describe("CardOverlay", () => {
  it("mounts nothing outside the near regime", () => {
    const { container } = render(
      <CardOverlay
        spec={many(5)}
        viewport={vp}
        regime="far"
        cap={200}
        width={400}
        height={300}
        renderCard={(n) => <div>{n.label}</div>}
      />,
    );
    expect(container.querySelectorAll("[data-card]")).toHaveLength(0);
  });

  it("mounts a card per node in the near regime", () => {
    render(
      <CardOverlay
        spec={many(3)}
        viewport={vp}
        regime="near"
        cap={200}
        width={400}
        height={300}
        renderCard={(n) => <div>{n.label}</div>}
      />,
    );
    expect(screen.getByText("N0")).toBeDefined();
    expect(screen.getByText("N2")).toBeDefined();
  });

  it("never mounts more cards than the cap, however far out you are", () => {
    const { container } = render(
      <CardOverlay
        spec={many(5000)}
        viewport={vp}
        regime="near"
        cap={50}
        width={400}
        height={300}
        renderCard={(n) => <div>{n.label}</div>}
      />,
    );
    // 5000 nodes at x = i * 0.001 all land on screen at scale 10, so the cap
    // is the only thing between the DOM and 5000 cards: exactly 50 mount.
    expect(container.querySelectorAll("[data-card]").length).toBeLessThanOrEqual(50);
    expect(container.querySelectorAll("[data-card]").length).toBe(50);
  });

  it("is inert to assistive technology, since the tree is the real content", () => {
    const { container } = render(
      <CardOverlay
        spec={many(2)}
        viewport={vp}
        regime="near"
        cap={10}
        width={400}
        height={300}
        renderCard={(n) => <div>{n.label}</div>}
      />,
    );
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    expect(container.firstElementChild?.hasAttribute("inert")).toBe(true);
  });

  it("does not mount a card for a node outside the viewport", () => {
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "n0", label: "N0", x: 100, y: 0, territory: null }],
    };
    const { container } = render(
      <CardOverlay
        spec={spec}
        viewport={vp}
        regime="near"
        cap={200}
        width={400}
        height={300}
        renderCard={(n) => <div>{n.label}</div>}
      />,
    );
    expect(container.querySelectorAll("[data-card]")).toHaveLength(0);
  });
});
