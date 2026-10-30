import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import { DEFAULT_ITEM_LABEL_FONT, placeItemLabels } from "./labels/itemLabels";
import { itemLabelRect } from "./labels/paintItemLabels";
import type { Frame } from "./shared/paint";
import type { MapSpec } from "./shared/spec";
import { DEFAULT_TUNING } from "./shared/tuning";

const frames = vi.hoisted(() => [] as Frame[]);
vi.mock("./shared/paint", async (importOriginal) => {
  const original = await importOriginal<typeof import("./shared/paint")>();
  return {
    ...original,
    paint: (...parameters: Parameters<typeof original.paint>) => {
      frames.push(parameters[4]);
    },
  };
});

// Fitted at scale 25.2 in 400x300: a sits at (74, 24), c at (200, 150), b at (326, 276).
const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, territory: null },
    { id: "b", label: "B", x: 10, y: 10, territory: null },
    { id: "c", label: "C", x: 5, y: 5, territory: null },
  ],
};
const FIT_VIEW = { scale: 25.2, tx: 74, ty: 24 };
const NEAR = { midAt: 0, nearAt: 0 };
const measure = (text: string) => ({ width: text.length * 6, height: 11 });

let callbacks: FrameRequestCallback[] = [];
beforeEach(() => {
  callbacks = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  // jsdom has no canvas context (`test/setup.ts`); without one `paint` is never reached.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    setTransform: () => {},
    font: "",
    measureText: (text: string) => ({ width: text.length * 6 }),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  frames.length = 0;
  vi.restoreAllMocks();
});

function lastFrame(): Frame {
  const frame = frames[frames.length - 1];
  if (frame === undefined) throw new Error("paint was never called");
  return frame;
}

/** The top edge of `id`'s plate at the fit: farther than the hover radius from its point, so only the plate names it. */
function plateTop(id: string): [number, number] {
  const labels = placeItemLabels(
    spec,
    [],
    { font: DEFAULT_ITEM_LABEL_FONT, width: DEFAULT_TUNING.itemLabelWidth, lines: DEFAULT_TUNING.itemLabelLines },
    measure,
  );
  const label = labels.find((each) => each.id === id);
  if (!label) throw new Error(`no label for ${id}`);
  const plate = itemLabelRect(label, FIT_VIEW);
  return [plate.left + plate.width / 2, plate.top + 1];
}

function hoverAt(container: HTMLElement, [horizontal, vertical]: [number, number]) {
  const surface = container.querySelector("[data-map-surface]") as HTMLElement;
  fireEvent.pointerMove(surface, { clientX: horizontal, clientY: vertical, pointerId: 1, pointerType: "mouse" });
  act(() => {
    for (const callback of callbacks.splice(0)) callback(0);
  });
}

describe("hovering an item label", () => {
  it("previews the edges of the plate's item (spec item labels §5)", () => {
    const { container } = render(
      <CorpusMap spec={spec} renderCard={(node) => node.label} width={400} height={300} thresholds={NEAR} />,
    );
    const top = plateTop("c");
    expect(150 - top[1]).toBeGreaterThan(DEFAULT_TUNING.hoverRadius);
    hoverAt(container, top);
    expect(lastFrame().hovered).toBe("c");
  });

  it("names nothing beneath the selected card, plate or not (review M2)", () => {
    // A card as large as the box fits nowhere, so it is clamped over the whole box.
    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={(node) => node.label}
        width={400}
        height={300}
        thresholds={NEAR}
        cardSize={{ width: 400, height: 300 }}
        defaultSelectedId="a"
      />,
    );
    hoverAt(container, plateTop("c"));
    expect(lastFrame().hovered).toBeNull();
  });
});
