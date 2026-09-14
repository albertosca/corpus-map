import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CorpusMap } from "../src/react/CorpusMap";
import type { MapSpec } from "../src/spec";

const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, territory: null },
    { id: "b", label: "B", x: 10, y: 10, territory: null },
    { id: "c", label: "C", x: 5, y: 5, territory: null },
  ],
};

function surface(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-map-surface]") as HTMLElement;
}

describe("CorpusMap interaction", () => {
  it("shows cards after zooming in far enough", () => {
    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        thresholds={{ midAt: 50, nearAt: 100 }}
      />,
    );
    expect(container.querySelectorAll("[data-card]")).toHaveLength(0);
    for (let i = 0; i < 12; i += 1) fireEvent.wheel(surface(container), { deltaY: -120, clientX: 200, clientY: 150 });
    expect(container.querySelectorAll("[data-card]").length).toBeGreaterThan(0);
  });

  it("drag moves the rendered cards", () => {
    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    const before = (container.querySelector("[data-card]") as HTMLElement).style.left;
    const el = surface(container);
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(el, { clientX: 160, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect((container.querySelector("[data-card]") as HTMLElement).style.left).not.toBe(before);
  });

  it("ignores pointer movement that did not start with a press", () => {
    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        thresholds={{ midAt: 0, nearAt: 0 }}
      />,
    );
    const before = (container.querySelector("[data-card]") as HTMLElement).style.left;
    fireEvent.pointerMove(surface(container), { clientX: 300, clientY: 100, pointerId: 1 });
    expect((container.querySelector("[data-card]") as HTMLElement).style.left).toBe(before);
  });
});
