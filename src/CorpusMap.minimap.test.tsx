import { fireEvent, render } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { CorpusMap } from "./CorpusMap";
import { MINIMAP_SIZE } from "./minimap/Minimap";
import type { MapSpec } from "./shared/spec";

const spec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [{ id: "a", label: "A", x: 0, y: 0, territory: null }],
};

const threeNodeSpec: MapSpec = {
  version: "1",
  territories: [],
  nodes: [
    { id: "a", label: "A", x: 0, y: 0, territory: null },
    { id: "b", label: "B", x: 10, y: 10, territory: null },
    { id: "c", label: "C", x: 5, y: 5, territory: null },
  ],
};

const NO_GROUPING = { width: 0, height: 0 };

function surface(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-map-surface]") as HTMLElement;
}

function minimap(container: HTMLElement): HTMLElement | null {
  return container.querySelector("[data-minimap]");
}

interface View {
  regime: string;
  ratio: number;
  visibleCount: number;
}

// jsdom has no canvas 2D implementation; `test/setup.ts` stubs `getContext`
// to return `null` globally, which `Minimap`'s paint effect already handles
// (`if (!ctx) return;`) but which also means that effect never actually
// runs under the default stub — no use counting real paints against it.
// This fake, installed only for the one test below and restored after,
// mirrors `CorpusMap.test.tsx`'s own `recordingContext` pattern: enough
// no-op methods for `paint`/`paintMinimap`'s full call surface (including
// `useMeasure`'s offscreen canvas, which needs `font`/`measureText`) that
// every canvas in the tree — the main one included — can actually paint,
// with `clearRect` on the *minimap's own* canvas specifically counted, so a
// paint is measured the same way fix round 1's `paintMinimap.test.ts`
// canary does: by the `clear()` that must start every real paint.
function fakeCtx(): CanvasRenderingContext2D {
  const noop = () => {};
  return {
    canvas: { width: 0, height: 0 },
    clearRect: noop,
    setTransform: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    arc: noop,
    fillText: noop,
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe("CorpusMap minimap (showcase Task 4)", () => {
  it("is absent by default", () => {
    const { container } = render(
      <CorpusMap spec={spec} renderCard={(n) => <div>{n.label}</div>} width={400} height={300} />,
    );
    expect(minimap(container)).toBeNull();
  });

  it("is absent with minimap={false}, same as omitting the prop", () => {
    const { container } = render(
      <CorpusMap spec={spec} renderCard={(n) => <div>{n.label}</div>} width={400} height={300} minimap={false} />,
    );
    expect(minimap(container)).toBeNull();
  });

  it("is present in the bottom-left corner with minimap={true}", () => {
    const { container } = render(
      <CorpusMap spec={spec} renderCard={(n) => <div>{n.label}</div>} width={400} height={300} minimap={true} />,
    );
    const el = minimap(container);
    expect(el).not.toBeNull();
    expect(el?.getAttribute("aria-hidden")).toBe("true");
    expect(el?.style.bottom).toBe("12px");
    expect(el?.style.left).toBe("12px");
    expect(el?.style.top).toBe("");
    expect(el?.style.right).toBe("");
  });

  it("moves to the given corner with minimap={{ corner }}", () => {
    const { container } = render(
      <CorpusMap
        spec={spec}
        renderCard={(n) => <div>{n.label}</div>}
        width={400}
        height={300}
        minimap={{ corner: "top-right" }}
      />,
    );
    const el = minimap(container);
    expect(el?.style.top).toBe("12px");
    expect(el?.style.right).toBe("12px");
    expect(el?.style.bottom).toBe("");
    expect(el?.style.left).toBe("");
  });

  it("does not repaint on an unrelated parent re-render — only when the view (x, y, w, h) actually changed (fix round 1, finding 2)", () => {
    let minimapPaints = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      const ctx = fakeCtx();
      if (this.hasAttribute("data-minimap")) {
        (ctx as unknown as { clearRect: () => void }).clearRect = () => {
          minimapPaints += 1;
        };
      }
      return ctx;
    } as unknown as typeof original;
    try {
      const { rerender } = render(
        <CorpusMap spec={spec} renderCard={(n) => <div>{n.label}</div>} width={400} height={300} minimap={true} />,
      );
      expect(minimapPaints).toBe(1);

      // An unrelated parent re-render: the same props by value, but a fresh
      // element (so `CorpusMap`, not being `memo`-wrapped, re-runs its body)
      // — `vp`/`width`/`height` never change, so the view is identical.
      rerender(
        <CorpusMap spec={spec} renderCard={(n) => <div>{n.label}</div>} width={400} height={300} minimap={true} />,
      );
      expect(minimapPaints).toBe(1);
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });

  it("a press at the minimap's centre centres the main view on the world centre, firing onViewChange like any other view change", () => {
    // 150 wide: the single node (fitted to the box centre, 75) lands off
    // screen after a 100 px drag right, the same shape
    // CorpusMap.handle.test.tsx's coalescing test uses, so this reuses
    // already-verified arithmetic rather than deriving new pixel math.
    //
    // The minimap's own press/drag is frame-coalesced the same way a drag
    // is (showcase Task 4), sharing the very same `rafId` (CorpusMap.tsx's
    // `scheduleFrame`) — so this test needs two separate flushes in the
    // same instance (one for the drag, one for the minimap press) and uses
    // the queue-then-flush stub (CorpusMap.handle.test.tsx's coalescing
    // test), not an immediately-invoking one: a mock that calls `cb`
    // synchronously inside `requestAnimationFrame` runs the callback (which
    // clears `rafId.current`) *before* that call's own return value
    // overwrites `rafId.current` back to non-null, so a second `scheduleFrame`
    // later in the same test would wrongly no-op — a real
    // `requestAnimationFrame` is asynchronous and never has this ordering
    // problem, so it is purely an artifact of that other mock style, not of
    // `scheduleFrame` itself.
    const callbacks: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    const flush = () => {
      act(() => {
        for (const cb of callbacks.splice(0)) cb(0);
      });
    };
    const width = 150;
    const height = 300;
    try {
      const onViewChange = vi.fn();
      const { container } = render(
        <CorpusMap
          spec={spec}
          renderCard={(n) => <div>{n.label}</div>}
          width={width}
          height={height}
          onViewChange={onViewChange}
          minimap={true}
        />,
      );
      expect(onViewChange).toHaveBeenCalledTimes(1);
      expect(onViewChange).toHaveBeenLastCalledWith({ regime: "far", ratio: 1, visibleCount: 1 } satisfies View);

      const el = surface(container);
      fireEvent.pointerDown(el, { clientX: 0, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerMove(el, { clientX: 100, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerUp(el, { clientX: 100, clientY: 0, pointerId: 1, button: 0, isPrimary: true });
      flush();
      expect(onViewChange).toHaveBeenLastCalledWith({ regime: "far", ratio: 1, visibleCount: 0 } satisfies View);

      // The single node sits at the world centre (worldBounds widens a lone
      // point to a small box around it), so pressing the minimap dead
      // centre must land the view back where it started: the node on
      // screen again.
      const mm = minimap(container) as HTMLElement;
      fireEvent.pointerDown(mm, {
        clientX: MINIMAP_SIZE.width / 2,
        clientY: MINIMAP_SIZE.height / 2,
        pointerId: 2,
        button: 0,
        isPrimary: true,
      });
      fireEvent.pointerUp(mm, {
        clientX: MINIMAP_SIZE.width / 2,
        clientY: MINIMAP_SIZE.height / 2,
        pointerId: 2,
        button: 0,
        isPrimary: true,
      });
      flush();
      expect(onViewChange).toHaveBeenLastCalledWith({ regime: "far", ratio: 1, visibleCount: 1 } satisfies View);
    } finally {
      raf.mockRestore();
    }
  });

  it("a drag (pointer held down, not just a press) keeps centring as it moves, and stops on pointercancel", () => {
    const width = 150;
    const height = 300;
    const callbacks: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    const flush = () => {
      act(() => {
        for (const cb of callbacks.splice(0)) cb(0);
      });
    };
    try {
      const onViewChange = vi.fn();
      const { container } = render(
        <CorpusMap
          spec={spec}
          renderCard={(n) => <div>{n.label}</div>}
          width={width}
          height={height}
          onViewChange={onViewChange}
          minimap={true}
        />,
      );
      const mm = minimap(container) as HTMLElement;

      // Press dead centre: the node (at the world centre) stays on screen.
      fireEvent.pointerDown(mm, {
        clientX: MINIMAP_SIZE.width / 2,
        clientY: MINIMAP_SIZE.height / 2,
        pointerId: 5,
        button: 0,
        isPrimary: true,
      });
      flush();
      expect(onViewChange).toHaveBeenLastCalledWith({ regime: "far", ratio: 1, visibleCount: 1 } satisfies View);

      // Still held down, drag to the minimap's own top-left corner: this is
      // `onPointerMove`'s `dragging.current` branch, not exercised by a
      // press-and-release alone, and it must keep centring — the far-off
      // world point pushes the node off the (150-wide) main box.
      fireEvent.pointerMove(mm, { clientX: 0, clientY: 0, pointerId: 5, button: 0, isPrimary: true });
      flush();
      expect(onViewChange).toHaveBeenLastCalledWith({ regime: "far", ratio: 1, visibleCount: 0 } satisfies View);

      // A pointercancel must stop the drag: a further move with the same
      // pointerId, after the cancel, must not centre again.
      const callsBeforeCancel = onViewChange.mock.calls.length;
      fireEvent.pointerCancel(mm, { pointerId: 5, button: 0, isPrimary: true });
      fireEvent.pointerMove(mm, {
        clientX: MINIMAP_SIZE.width,
        clientY: MINIMAP_SIZE.height,
        pointerId: 5,
        button: 0,
        isPrimary: true,
      });
      flush();
      expect(onViewChange.mock.calls.length).toBe(callsBeforeCancel);
    } finally {
      raf.mockRestore();
    }
  });

  it("a click on the minimap never selects a card underneath it, though the same point on the surface does (I11-style guard)", () => {
    // Card "a" (NO_GROUPING: its box is its anchor, +6 px layout gap) lands
    // at (80,24)-(180,64) for this 400x300 box, exactly like
    // CorpusMap.interaction.test.tsx's own click-select test. The
    // top-right... no, top-left minimap corner (margin 12, 160x110) covers
    // (12,12)-(172,122), which overlaps that box, so (90,30) is inside both.
    const rects = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.hasAttribute("data-minimap")) {
        return {
          x: 12,
          y: 12,
          left: 12,
          top: 12,
          width: MINIMAP_SIZE.width,
          height: MINIMAP_SIZE.height,
          right: 12 + MINIMAP_SIZE.width,
          bottom: 12 + MINIMAP_SIZE.height,
          toJSON: () => ({}),
        } as DOMRect;
      }
      const id = this.getAttribute("data-card");
      const [x, y, w, h] =
        id === null
          ? [0, 0, 400, 300]
          : [Number.parseFloat(this.style.left), Number.parseFloat(this.style.top), 100, 40];
      return { x, y, width: w, height: h, left: x, top: y, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect;
    });
    try {
      const onSelect = vi.fn();
      const { container } = render(
        <CorpusMap
          spec={threeNodeSpec}
          renderCard={(n) => <div>{n.label}</div>}
          width={400}
          height={300}
          thresholds={{ midAt: 0, nearAt: 0 }}
          onSelect={onSelect}
          cardSize={NO_GROUPING}
          minimap={{ corner: "top-left" }}
        />,
      );

      const mm = minimap(container) as HTMLElement;
      fireEvent.pointerDown(mm, { clientX: 90, clientY: 30, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerUp(mm, { clientX: 91, clientY: 31, pointerId: 1, button: 0, isPrimary: true });
      expect(onSelect).not.toHaveBeenCalled();

      // Meaningfulness check: the very same click point, dispatched at the
      // surface instead of the minimap, does select — proving the guard
      // above, not a coincidentally-empty hit test, is what stopped it.
      const el = surface(container);
      fireEvent.pointerDown(el, { clientX: 90, clientY: 30, pointerId: 2, button: 0, isPrimary: true });
      fireEvent.pointerUp(el, { clientX: 91, clientY: 31, pointerId: 2, button: 0, isPrimary: true });
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a", label: "A" }));
    } finally {
      rects.mockRestore();
    }
  });
});
