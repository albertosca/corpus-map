import { fireEvent, render } from "@testing-library/react";
import { act, Profiler, type ProfilerOnRenderCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import type { MapSpec } from "./shared/spec";
import type { MapViewport } from "./viewport/publicViewport";

const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: null }],
};

function surface(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-map-surface]") as HTMLElement;
}

function cardLeft(container: HTMLElement): number {
  return Number.parseFloat((container.querySelector('[data-card="a"]') as HTMLElement).style.left);
}

describe("CorpusMap frame-coalesced dragging (metric 13)", () => {
  it("costs one React commit per animation frame for a burst of 100 pointer moves", () => {
    const callbacks: FrameRequestCallback[] = [];
    const animationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      });
    try {
      let commits = 0;
      const onRender: ProfilerOnRenderCallback = () => {
        commits += 1;
      };
      const { container } = render(
        <Profiler id="m" onRender={onRender}>
          <CorpusMap
            spec={spec}
            renderCard={(node) => <div>{node.label}</div>}
            width={400}
            height={300}
            thresholds={{ midAt: 0, nearAt: 0 }}
            // Zero-size cards (map-feel Task 8): a card's box then collapses
            // to a point offset from its anchor by exactly the layout gap
            // (`left = anchorX + 6`), so this test's pixel arithmetic — which
            // is about the drag's frame-coalescing, not card placement — is
            // unaffected by which of `placeSelectedCard`'s candidates wins.
            // A non-zero `cardSize` here would make the winning candidate
            // (and so the sign of `after - before`) flip mid-drag as the
            // card nears the box edge. a is selected so its one card exists.
            cardSize={{ width: 0, height: 0 }}
            defaultSelectedId="a"
          />
        </Profiler>,
      );
      const element = surface(container);
      const before = cardLeft(container);

      fireEvent.pointerDown(element, { clientX: 0, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      commits = 0;
      for (let step = 1; step <= 100; step += 1) {
        fireEvent.pointerMove(element, { clientX: step, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      }
      // A whole burst of moves, all within one animation frame, costs zero
      // commits until the frame actually runs — calling `setVp` directly in
      // the move handler instead of coalescing it here would fail this.
      expect(commits).toBe(0);
      expect(callbacks).toHaveLength(1);

      act(() => {
        for (const callback of callbacks.splice(0)) callback(0);
      });

      expect(commits).toBe(1);
      const after = cardLeft(container);
      expect(after - before).toBeCloseTo(100, 6);
    } finally {
      animationFrame.mockRestore();
    }
  });

  it("a controlled drag still commits once per frame and proposes once (spec slice C §5)", () => {
    const callbacks: FrameRequestCallback[] = [];
    const animationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callbacks.push(callback);
        return callbacks.length;
      });
    try {
      let commits = 0;
      const onRender: ProfilerOnRenderCallback = () => {
        commits += 1;
      };
      const proposals: MapViewport[] = [];
      function Accepting() {
        const [view, setView] = useState<MapViewport>({ centre: [0, 0], zoom: 1 });
        return (
          <CorpusMap
            spec={spec}
            renderCard={(node) => <div>{node.label}</div>}
            width={400}
            height={300}
            thresholds={{ midAt: 0, nearAt: 0 }}
            cardSize={{ width: 0, height: 0 }}
            defaultSelectedId="a"
            viewport={view}
            onViewportChange={(next) => {
              proposals.push(next);
              setView(next);
            }}
          />
        );
      }
      const { container } = render(
        <Profiler id="m" onRender={onRender}>
          <Accepting />
        </Profiler>,
      );
      const element = surface(container);
      const before = cardLeft(container);

      fireEvent.pointerDown(element, { clientX: 0, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      commits = 0;
      for (let step = 1; step <= 100; step += 1) {
        fireEvent.pointerMove(element, { clientX: step, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      }
      expect(commits).toBe(0);
      expect(callbacks).toHaveLength(1);

      act(() => {
        for (const callback of callbacks.splice(0)) callback(0);
      });

      expect(commits).toBe(1);
      expect(proposals).toHaveLength(1);
      expect(cardLeft(container) - before).toBeCloseTo(100, 6);
    } finally {
      animationFrame.mockRestore();
    }
  });
});
