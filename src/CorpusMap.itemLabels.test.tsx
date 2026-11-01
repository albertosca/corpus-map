import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import { DEFAULT_ITEM_LABEL_FONT, placeItemLabels, placingItemLabels } from "./labels/itemLabels";
import { itemLabelRect } from "./labels/paintItemLabels";
import { estimateText } from "./labels/placement";
import type { MapSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";

// The real placer, wrapped so a test can count how often the map runs it.
vi.mock("./labels/itemLabels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./labels/itemLabels")>();
  return { ...actual, placingItemLabels: vi.fn(actual.placingItemLabels) };
});

// Same corpus as CorpusMap.interaction.test.tsx, plus "d", whose blank label
// gets no plate: fitted at scale 25.2 in 400x300, a sits at (74, 24), c at
// (200, 150), b at (326, 276) and d at (326, 24).
const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, territory: null },
    { id: "b", label: "B", x: 10, y: 10, territory: null },
    { id: "c", label: "C", x: 5, y: 5, territory: null },
    { id: "d", label: " ", x: 10, y: 0, territory: null },
  ],
};
const FIT_VIEW = { scale: 25.2, tx: 74, ty: 24 };
const NEAR = { midAt: 0, nearAt: 0 };

let callbacks: FrameRequestCallback[] = [];

function surface(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-map-surface]") as HTMLElement;
}

/** The plate of `id` at the fitted view, as the map paints it (jsdom measures with `estimateText`). */
function plateOf(id: string) {
  const labels = placeItemLabels(
    spec,
    [],
    { font: DEFAULT_ITEM_LABEL_FONT, width: DEFAULT_TUNING.itemLabelWidth, lines: DEFAULT_TUNING.itemLabelLines },
    estimateText,
  );
  const label = labels.find((each) => each.id === id);
  if (!label) throw new Error(`no label for ${id}`);
  return itemLabelRect(label, FIT_VIEW);
}

function flush() {
  act(() => {
    for (const callback of callbacks.splice(0)) callback(0);
  });
}

function move(element: HTMLElement, horizontal: number, vertical: number) {
  fireEvent.pointerMove(element, { clientX: horizontal, clientY: vertical, pointerId: 1 });
  flush();
}

function press(element: HTMLElement, horizontal: number, vertical: number) {
  fireEvent.pointerDown(element, { clientX: horizontal, clientY: vertical, pointerId: 1, button: 0, isPrimary: true });
  fireEvent.pointerUp(element, { clientX: horizontal, clientY: vertical, pointerId: 1, button: 0, isPrimary: true });
}

describe("CorpusMap item labels and the one card", () => {
  // Queued, then flushed inside act(): a fake that runs the callback at once
  // leaves the map believing a frame is still pending, so later moves never resolve.
  let animationFrame: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    callbacks = [];
    animationFrame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
  });
  afterEach(() => {
    animationFrame.mockRestore();
  });

  it("shows no card at near without a selection", () => {
    const { container } = render(
      <CorpusMap spec={spec} renderCard={(node) => node.label} width={400} height={300} thresholds={NEAR} />,
    );
    expect(container.querySelectorAll("[data-card]")).toHaveLength(0);
  });

  it("shows one card for the selected item at mid and near, none at far", () => {
    const view = (thresholds: { midAt: number; nearAt: number }) => (
      <CorpusMap
        spec={spec}
        renderCard={(node) => node.label}
        width={400}
        height={300}
        thresholds={thresholds}
        defaultSelectedId="a"
      />
    );
    const far = render(view({ midAt: 4, nearAt: 8 }));
    expect(far.container.querySelectorAll("[data-card]")).toHaveLength(0);
    far.unmount();
    const mid = render(view({ midAt: 0, nearAt: 8 }));
    expect([...mid.container.querySelectorAll("[data-card]")].map((card) => card.getAttribute("data-card"))).toEqual([
      "a",
    ]);
    mid.unmount();
    const near = render(view(NEAR));
    expect([...near.container.querySelectorAll("[data-card]")].map((card) => card.getAttribute("data-card"))).toEqual([
      "a",
    ]);
  });

  it("hides the card once its point leaves the box", () => {
    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={(node) => node.label}
        width={400}
        height={300}
        thresholds={NEAR}
        defaultSelectedId="a"
      />,
    );
    expect(container.querySelectorAll("[data-card]")).toHaveLength(1);
    const element = surface(container);
    // Drag 100 px left: a moves from (74, 24) to (-26, 24), out of the box.
    fireEvent.pointerDown(element, { clientX: 300, clientY: 200, pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerMove(element, { clientX: 200, clientY: 200, pointerId: 1, button: 0, isPrimary: true });
    flush();
    fireEvent.pointerUp(element, { clientX: 200, clientY: 200, pointerId: 1, button: 0, isPrimary: true });
    expect(container.querySelectorAll("[data-card]")).toHaveLength(0);
  });

  it("a press on a drawn item label selects its item", () => {
    const onSelectedChange = vi.fn();
    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={(node) => node.label}
        width={400}
        height={300}
        thresholds={NEAR}
        onSelectedChange={onSelectedChange}
      />,
    );
    const plate = plateOf("c");
    // The plate's top edge: more than the 12 px hover radius above c (200, 150), so only the plate can take it.
    const vertical = plate.top + 1;
    expect(150 - vertical).toBeGreaterThan(DEFAULT_TUNING.hoverRadius);
    press(surface(container), plate.left + plate.width / 2, vertical);
    expect(onSelectedChange).toHaveBeenLastCalledWith("c");
  });

  it("shows no tooltip over a drawn label, and still does for an unlabelled point", () => {
    const { container } = render(
      <CorpusMap spec={spec} renderCard={(node) => node.label} width={400} height={300} thresholds={NEAR} />,
    );
    const element = surface(container);
    move(element, 74 + 6, 24);
    expect(container.querySelector("[data-hover]")).toBeNull();
    const plate = plateOf("a");
    move(element, plate.left + plate.width / 2, plate.top + 1);
    expect(container.querySelector("[data-hover]")).toBeNull();
    move(element, 326 + 6, 24);
    expect(container.querySelector('[data-hover="d"]')).not.toBeNull();
  });

  it("renderCard receives the node only", () => {
    const renderCard = vi.fn((node: { label: string }) => node.label);
    render(
      <CorpusMap
        spec={spec}
        renderCard={renderCard}
        width={400}
        height={300}
        thresholds={NEAR}
        defaultSelectedId="b"
      />,
    );
    expect(renderCard).toHaveBeenCalled();
    for (const call of renderCard.mock.calls) expect(call).toHaveLength(1);
    expect(renderCard.mock.calls[0]?.[0]).toMatchObject({ id: "b" });
  });

  it("does not place the item labels again when only the palette changes (spec item labels §3)", () => {
    const placer = vi.mocked(placingItemLabels);
    const map = (palette: string[]) => (
      <CorpusMap
        spec={spec}
        renderCard={(node) => node.label}
        width={400}
        height={300}
        thresholds={NEAR}
        theme={{ ...DEFAULT_THEME, palette }}
      />
    );
    const { rerender } = render(map(DEFAULT_THEME.palette));
    const placements = placer.mock.calls.length;
    expect(placements).toBeGreaterThan(0);
    rerender(map([...DEFAULT_THEME.palette].reverse()));
    expect(placer.mock.calls.length).toBe(placements);
  });

  it("places the item labels once when a new spec renames a territory (review I1)", () => {
    const placer = vi.mocked(placingItemLabels);
    const named = (name: string): MapSpec => ({
      version: "1",
      territories: [{ id: "t", name, members: ["a", "b"], centroid: [5, 5] }],
      nodes: [
        { id: "a", label: "A", x: 0, y: 0, territory: "t" },
        { id: "b", label: "B", x: 10, y: 10, territory: "t" },
      ],
    });
    const map = (name: string) => (
      <CorpusMap spec={named(name)} renderCard={(node) => node.label} width={400} height={300} thresholds={NEAR} />
    );
    const { rerender } = render(map("Short"));
    const placements = placer.mock.calls.length;
    rerender(map("A much longer territory name"));
    expect(placer.mock.calls.length - placements).toBe(1);
  });

  it("hides the card while the points are faded out at mid, and fades it with them (review I2)", () => {
    const view = (midAt: number) => (
      <CorpusMap
        spec={spec}
        renderCard={(node) => node.label}
        width={400}
        height={300}
        thresholds={{ midAt, nearAt: 5 }}
        defaultSelectedId="a"
      />
    );
    // At the fit the ratio is 1: with midAt 1 the points are at alpha 0, so no card.
    const hidden = render(view(1));
    expect(hidden.container.querySelectorAll("[data-card]")).toHaveLength(0);
    hidden.unmount();
    // With midAt 0.9 the points are at (1 - 0.9) / (0.9 x 0.25) = 0.444..., and so is the card.
    const fading = render(view(0.9));
    const card = fading.container.querySelector("[data-card]") as HTMLElement;
    expect(Number((card.parentElement as HTMLElement).style.opacity)).toBeCloseTo(0.1 / 0.225, 5);
  });

  it("shows the tooltip for a labelled point whose plate is off the canvas (review M1)", () => {
    const { container } = render(
      <CorpusMap spec={spec} renderCard={(node) => node.label} width={400} height={300} thresholds={NEAR} />,
    );
    const element = surface(container);
    // Drag 21 px up: a moves from (74, 24) to (74, 3), and its plate's bottom to -3, above the canvas.
    fireEvent.pointerDown(element, { clientX: 300, clientY: 200, pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerMove(element, { clientX: 300, clientY: 179, pointerId: 1, button: 0, isPrimary: true });
    flush();
    fireEvent.pointerUp(element, { clientX: 300, clientY: 179, pointerId: 1, button: 0, isPrimary: true });
    move(element, 74 + 6, 3);
    expect(container.querySelector('[data-hover="a"]')).not.toBeNull();
  });

  it("shows no card for a selected point under an inset (review M3)", () => {
    const view = (selected: string) => (
      <CorpusMap
        spec={spec}
        renderCard={(node) => node.label}
        width={400}
        height={300}
        thresholds={NEAR}
        insets={{ right: 200 }}
        defaultSelectedId={selected}
      />
    );
    // b sits at (326, 276), under the 200 px drawer on the right; a at (74, 24) is in the usable area.
    const covered = render(view("b"));
    expect(covered.container.querySelectorAll("[data-card]")).toHaveLength(0);
    covered.unmount();
    const open = render(view("a"));
    expect(open.container.querySelectorAll("[data-card]")).toHaveLength(1);
  });

  it("shows the tooltip for a labelled point whose plate is under the selected card (review M1)", () => {
    // A card as large as the box fits nowhere, so it is clamped over the whole box and every plate.
    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={(node) => node.label}
        width={400}
        height={300}
        thresholds={NEAR}
        cardSize={{ width: 400, height: 300 }}
        defaultSelectedId="b"
      />,
    );
    move(surface(container), 200 + 6, 150);
    expect(container.querySelector('[data-hover="c"]')).not.toBeNull();
  });

  it("a press on a plate painted below opacity 0.1 selects nothing (review M6)", () => {
    const onSelectedChange = vi.fn();
    // At the fit's ratio 1, midAt = nearAt = 0.95 put the points and the labels each at
    // 0.05 / 0.2375 = 0.21, so the plates are painted at their product, 0.044.
    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={(node) => node.label}
        width={400}
        height={300}
        thresholds={{ midAt: 0.95, nearAt: 0.95 }}
        onSelectedChange={onSelectedChange}
      />,
    );
    const plate = plateOf("c");
    press(surface(container), plate.left + plate.width / 2, plate.top + 1);
    expect(onSelectedChange).not.toHaveBeenCalledWith("c");
  });
});
