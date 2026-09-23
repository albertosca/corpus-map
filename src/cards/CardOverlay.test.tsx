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

// A zero-size card frame collapses `layoutCards`'s first candidate to
// exactly `(anchorX + gap, anchorY)`: no candidate can ever overlap another
// (a zero-area rectangle overlaps nothing), so every anchor keeps its own
// card regardless of how close together the anchors are. The tests below
// that are about mounting/cap/inertness, not about the group fallback, use
// this to keep one card per node — matching their pre-layout intent —
// instead of exercising the crowding behaviour metric 11's tests cover.
const NO_GROUPING = { width: 0, height: 0 };

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
        cardSize={NO_GROUPING}
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
        cardSize={NO_GROUPING}
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

  it("places a lone card at the first layout candidate — right of the anchor, vertically centred (left = x + 6, top = y - 28)", () => {
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "n0", label: "N0", x: 200, y: 150, territory: null }],
    };
    const { container } = render(
      <CardOverlay
        spec={spec}
        viewport={{ scale: 1, tx: 0, ty: 0 }}
        regime="near"
        cap={200}
        width={400}
        height={300}
        renderCard={(n) => <div>{n.label}</div>}
      />,
    );
    // Default cardSize is 160x56 and the default gap is 6: with the anchor
    // comfortably inside the box, the first of `layoutCards`'s eight
    // candidates — right of the point, vertically centred — always fits and
    // wins.
    const card = container.querySelector('[data-card="n0"]') as HTMLElement;
    expect(card.style.left).toBe("206px");
    expect(card.style.top).toBe("122px");
  });

  it("sizes each card frame to the configured cardSize", () => {
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "n0", label: "N0", x: 200, y: 150, territory: null }],
    };
    const { container } = render(
      <CardOverlay
        spec={spec}
        viewport={{ scale: 1, tx: 0, ty: 0 }}
        regime="near"
        cap={200}
        width={400}
        height={300}
        cardSize={{ width: 120, height: 40 }}
        renderCard={(n) => <div>{n.label}</div>}
      />,
    );
    const card = container.querySelector('[data-card="n0"]') as HTMLElement;
    expect(card.style.width).toBe("120px");
    expect(card.style.height).toBe("40px");
  });

  it("applies the opacity prop to the overlay wrapper", () => {
    const { container } = render(
      <CardOverlay
        spec={many(1)}
        viewport={vp}
        regime="near"
        cap={200}
        width={400}
        height={300}
        opacity={0.4}
        renderCard={(n) => <div>{n.label}</div>}
      />,
    );
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe("0.4");
  });

  it("renders a group badge for anchors that cannot each get their own card, and never mounts more cards than anchors", () => {
    // Four anchors at the same point, in a box barely bigger than the card
    // frame: none of `layoutCards`'s eight candidates fits with room for the
    // 6 px gap, so the first anchor is placed clamped to the box corner and
    // the other three each join it as a group member.
    const n = 4;
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: Array.from({ length: n }, (_, i) => ({ id: `g${i}`, label: `G${i}`, x: 0, y: 0, territory: null })),
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
        renderCard={(node) => <div>{node.label}</div>}
      />,
    );
    const cards = container.querySelectorAll("[data-card]");
    expect(cards.length).toBeLessThanOrEqual(n);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.getAttribute("data-card-count")).toBe("4");
    const badge = container.querySelector("[data-group-badge]");
    expect(badge?.textContent).toBe("+3");
  });

  it("places zero overlapping card pairs and none outside the box across 200 on-screen nodes (metric 11, component level)", () => {
    const width = 960;
    const height = 640;
    const n = 200;
    // A 20-column grid, closer together (45x60) than the default card frame
    // (160x56): a real stress case for the group fallback, not just a
    // spread-out arrangement `layoutCards` would trivially satisfy.
    const spec: MapSpec = {
      version: "1",
      territories: [],
      nodes: Array.from({ length: n }, (_, i) => ({
        id: `n${i}`,
        label: `N${i}`,
        x: (i % 20) * 45,
        y: Math.floor(i / 20) * 60,
        territory: null,
      })),
    };
    const { container } = render(
      <CardOverlay
        spec={spec}
        viewport={{ scale: 1, tx: 0, ty: 0 }}
        regime="near"
        cap={200}
        width={width}
        height={height}
        renderCard={(node) => <div>{node.label}</div>}
      />,
    );
    const boxes = [...container.querySelectorAll<HTMLElement>("[data-card]")].map((el) => ({
      left: Number.parseFloat(el.style.left),
      top: Number.parseFloat(el.style.top),
      width: Number.parseFloat(el.style.width),
      height: Number.parseFloat(el.style.height),
    }));
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.left + b.width).toBeLessThanOrEqual(width);
      expect(b.top + b.height).toBeLessThanOrEqual(height);
    }
    const rectsOverlap = (a: (typeof boxes)[number], c: (typeof boxes)[number]) =>
      a.left < c.left + c.width && c.left < a.left + a.width && a.top < c.top + c.height && c.top < a.top + a.height;
    let overlapCount = 0;
    for (const [i, a] of boxes.entries()) {
      for (const [j, c] of boxes.entries()) {
        if (j > i && rectsOverlap(a, c)) overlapCount += 1;
      }
    }
    expect(overlapCount).toBe(0);
  });
});
