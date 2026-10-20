import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import { validateSpec } from "./shared/spec";

const legendRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock("./legend/Legend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./legend/Legend")>();
  const { memo, createElement } = await import("react");
  return {
    ...actual,
    Legend: memo((properties: Parameters<typeof actual.LegendView>[0]) => {
      legendRenders.count += 1;
      return createElement(actual.LegendView, properties);
    }),
  };
});

// The North/South spec of CorpusMap.legend.test.tsx, copied (test files do not share fixtures here).
const cluster = (territory: string, left: number) =>
  [0, 1, 2].map((offset) => ({
    id: `${territory}${offset}`,
    label: `${territory}${offset}`,
    x: left + offset,
    y: left + offset,
    territory,
  }));

const spec = validateSpec({
  version: "1",
  territories: [
    { id: "north", name: "North", members: ["north0", "north1", "north2"], centroid: [1, 1] },
    { id: "south", name: "South", members: ["south0", "south1", "south2"], centroid: [101, 101] },
  ],
  nodes: [...cluster("north", 0), ...cluster("south", 100)],
});

describe("legend commits", () => {
  it("a pan that keeps the on-screen set does not re-render the legend; one that changes it does", () => {
    const callbacks: FrameRequestCallback[] = [];
    const animationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      });
    try {
      const { container } = render(<CorpusMap spec={spec} width={400} height={300} renderCard={() => null} legend />);
      const surface = container.querySelector("[data-map-surface]") as HTMLElement;
      const flush = () =>
        act(() => {
          for (const callback of callbacks.splice(0)) callback(0);
        });
      const drag = (horizontalDelta: number) => {
        fireEvent.pointerDown(surface, { clientX: 200, clientY: 150, pointerId: 1, button: 0, isPrimary: true });
        fireEvent.pointerMove(surface, {
          clientX: 200 + horizontalDelta,
          clientY: 150,
          pointerId: 1,
          button: 0,
          isPrimary: true,
        });
        flush();
        fireEvent.pointerUp(surface, {
          clientX: 200 + horizontalDelta,
          clientY: 150,
          pointerId: 1,
          button: 0,
          isPrimary: true,
        });
      };
      const before = legendRenders.count;
      drag(1);
      expect(legendRenders.count).toBe(before);
      drag(-2000);
      expect(legendRenders.count).toBeGreaterThan(before);
    } finally {
      animationFrame.mockRestore();
    }
  });
});
