import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import { DEFAULT_ITEM_LABEL_FONT, placeItemLabels } from "./labels/itemLabels";
import { itemLabelRect } from "./labels/paintItemLabels";
import { estimateText } from "./labels/placement";
import type { MapSpec } from "./shared/spec";
import { DEFAULT_THEME } from "./shared/theme";
import { DEFAULT_TUNING } from "./shared/tuning";

// The real placer, wrapped so a test can count how often the map runs it.
vi.mock("./labels/itemLabels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./labels/itemLabels")>();
  return { ...actual, placeItemLabels: vi.fn(actual.placeItemLabels) };
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
    const placer = vi.mocked(placeItemLabels);
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
});
