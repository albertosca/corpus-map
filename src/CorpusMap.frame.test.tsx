import { fireEvent, render } from "@testing-library/react";
import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import type { MapSpec } from "./shared/spec";

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
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      callbacks.push(cb);
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
            renderCard={(n) => <div>{n.label}</div>}
            width={400}
            height={300}
            thresholds={{ midAt: 0, nearAt: 0 }}
          />
        </Profiler>,
      );
      const el = surface(container);
      const before = cardLeft(container);

      fireEvent.pointerDown(el, { clientX: 0, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      commits = 0;
      for (let i = 1; i <= 100; i += 1) {
        fireEvent.pointerMove(el, { clientX: i, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      }
      // A whole burst of moves, all within one animation frame, costs zero
      // commits until the frame actually runs — calling `setVp` directly in
      // the move handler instead of coalescing it here would fail this.
      expect(commits).toBe(0);
      expect(callbacks).toHaveLength(1);

      act(() => {
        for (const cb of callbacks.splice(0)) cb(0);
      });

      expect(commits).toBe(1);
      const after = cardLeft(container);
      expect(after - before).toBeCloseTo(100, 6);
    } finally {
      raf.mockRestore();
    }
  });
});
