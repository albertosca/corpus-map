import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CorpusMap, type CorpusMapHandle } from "./CorpusMap";
import type { MapSpec } from "./shared/spec";

const lineSpec: MapSpec = {
  version: "1",
  territories: [],
  nodes: Array.from({ length: 11 }, (_, index) => ({
    id: `n${index}`,
    label: `Item ${index}`,
    x: index * 10,
    y: 0,
    territory: null,
  })),
};

function renderMap(properties: Partial<Parameters<typeof CorpusMap>[0]> = {}) {
  return render(
    <CorpusMap
      spec={lineSpec}
      renderCard={(node) => <div>{node.label}</div>}
      width={400}
      height={300}
      {...properties}
    />,
  );
}

function surface(container: HTMLElement): HTMLElement {
  return container.querySelector("[data-map-surface]") as HTMLElement;
}

describe("CorpusMap surface focus (spec slice B §4)", () => {
  it("is a focusable map region named after the corpus size", () => {
    const { container } = renderMap();
    const root = surface(container);
    expect(root.tabIndex).toBe(0);
    expect(root.getAttribute("role")).toBe("region");
    expect(root.getAttribute("aria-roledescription")).toBe("map");
    expect(screen.getByRole("region", { name: "Map of 11 items" })).toBe(root);
  });

  it("says item, singular, for a corpus of one", () => {
    renderMap({ spec: { ...lineSpec, nodes: lineSpec.nodes.slice(0, 1) } });
    expect(screen.getByRole("region", { name: "Map of 1 item" })).toBeDefined();
  });

  it.each(["", "   "])("keeps the default name when the label prop is blank (%j)", (label) => {
    renderMap({ label });
    expect(screen.getByRole("region", { name: "Map of 11 items" })).toBeDefined();
  });

  it("takes its name from the label prop", () => {
    renderMap({ label: "Papers on computer science" });
    expect(screen.getByRole("region", { name: "Papers on computer science" })).toBeDefined();
  });

  it("is the first tab stop", async () => {
    const { container } = renderMap();
    await userEvent.tab();
    expect(document.activeElement).toBe(surface(container));
  });

  it("focuses the surface through the handle", () => {
    const handle = createRef<CorpusMapHandle>();
    const { container } = renderMap({ ref: handle });
    act(() => handle.current?.focus());
    expect(document.activeElement).toBe(surface(container));
  });

  it("shows no focus ring when a press on the minimap focuses the surface", () => {
    const { container } = renderMap({ minimap: true });
    const root = surface(container);
    const minimap = container.querySelector("[data-minimap]") as HTMLElement;
    fireEvent.pointerDown(minimap, { clientX: 5, clientY: 5, pointerId: 1, button: 0, isPrimary: true });
    act(() => root.focus());
    expect(root.hasAttribute("data-focus-visible")).toBe(false);
  });

  it("still shows the ring on keyboard focus after a press moved focus into the legend", async () => {
    const withTerritory: MapSpec = {
      version: "1",
      territories: [{ id: "t", name: "Only land", members: ["n0"], centroid: [0, 0] }],
      nodes: [{ id: "n0", label: "Item 0", x: 0, y: 0, territory: "t" }],
    };
    const { container } = renderMap({ spec: withTerritory, legend: true });
    const root = surface(container);
    const toggle = container.querySelector("[data-legend] button") as HTMLButtonElement;
    fireEvent.pointerDown(toggle, { clientX: 5, clientY: 5, pointerId: 1, button: 0, isPrimary: true });
    act(() => toggle.focus());
    await new Promise((resolve) => setTimeout(resolve, 0));
    act(() => root.focus());
    expect(root.hasAttribute("data-focus-visible")).toBe(true);
  });

  it("shows its focus ring on keyboard focus, not on a press", async () => {
    const { container } = renderMap();
    const root = surface(container);
    fireEvent.pointerDown(root, { clientX: 10, clientY: 10, pointerId: 1, button: 0, isPrimary: true });
    act(() => root.focus());
    expect(root.hasAttribute("data-focus-visible")).toBe(false);
    act(() => root.blur());
    await userEvent.tab();
    expect(root.hasAttribute("data-focus-visible")).toBe(true);
    expect(root.style.outline).toContain("3px solid");
  });
});

interface View {
  regime: string;
  ratio: number;
  visibleCount: number;
}

function renderTracked(properties: Partial<Parameters<typeof CorpusMap>[0]> = {}) {
  const calls: View[] = [];
  const result = renderMap({ onViewChange: (view) => calls.push(view), ...properties });
  const last = () => {
    const view = calls[calls.length - 1];
    if (!view) throw new Error("expected onViewChange");
    return view;
  };
  return { ...result, calls, last, root: surface(result.container) };
}

describe("CorpusMap surface keys (spec slice B §4)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("zooms in and out around the centre with + and -", () => {
    const { root, last } = renderTracked();
    fireEvent.keyDown(root, { key: "+" });
    expect(last().ratio).toBeGreaterThan(1);
    fireEvent.keyDown(root, { key: "-" });
    expect(last().ratio).toBeCloseTo(1, 9);
  });

  it("captures Ctrl/Cmd + and - while focused", () => {
    const { root, last } = renderTracked();
    const event = new KeyboardEvent("keydown", { key: "=", ctrlKey: true, bubbles: true, cancelable: true });
    act(() => {
      root.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(last().ratio).toBeGreaterThan(1);
  });

  it("pans so the view travels right on ArrowRight and back on ArrowLeft", () => {
    const { root, last } = renderTracked();
    for (let step = 0; step < 6; step += 1) fireEvent.keyDown(root, { key: "+" });
    const before = last().visibleCount;
    for (let step = 0; step < 5; step += 1) fireEvent.keyDown(root, { key: "ArrowRight", shiftKey: true });
    const after = last().visibleCount;
    expect(after).toBeLessThan(before);
    for (let step = 0; step < 5; step += 1) fireEvent.keyDown(root, { key: "ArrowLeft", shiftKey: true });
    expect(last().visibleCount).toBe(before);
  });

  it("fits on 0 and on Home", () => {
    const { root, last } = renderTracked();
    for (const key of ["0", "Home"]) {
      fireEvent.keyDown(root, { key: "+" });
      fireEvent.keyDown(root, { key: "+" });
      fireEvent.keyDown(root, { key });
      expect(last().ratio).toBe(1);
      expect(last().regime).toBe("far");
    }
  });

  it("zooms out one regime on Escape: near to mid, mid to far, nothing at far", () => {
    const { root, last } = renderTracked();
    for (let step = 0; step < 40 && last().regime !== "near"; step += 1) fireEvent.keyDown(root, { key: "+" });
    expect(last().regime).toBe("near");
    fireEvent.keyDown(root, { key: "Escape" });
    expect(last().regime).toBe("mid");
    expect(last().ratio).toBeCloseTo(Math.sqrt(12), 9);
    fireEvent.keyDown(root, { key: "Escape" });
    expect(last().regime).toBe("far");
    expect(last().ratio).toBe(1);
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      root.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves outside a mid band of zero width on Escape from near", () => {
    const { root, last } = renderTracked({ thresholds: { midAt: 6, nearAt: 6 } });
    for (let step = 0; step < 40 && last().regime !== "near"; step += 1) fireEvent.keyDown(root, { key: "+" });
    expect(last().regime).toBe("near");
    fireEvent.keyDown(root, { key: "Escape" });
    expect(last().ratio).toBe(1);
    expect(last().regime).toBe("far");
  });

  it("never zooms in on Escape from near held below the mid band's middle by hysteresis", () => {
    // Hysteresis 0.45 keeps near alive down to ratio 3.3, below the mid band's middle (sqrt(24) ~ 4.9).
    const { root, last } = renderTracked({ thresholds: { midAt: 4, nearAt: 6 }, tuning: { hysteresis: 0.45 } });
    for (let step = 0; step < 40 && last().regime !== "near"; step += 1) fireEvent.keyDown(root, { key: "+" });
    for (let step = 0; step < 40 && last().ratio >= Math.sqrt(24); step += 1) fireEvent.keyDown(root, { key: "-" });
    expect(last().regime).toBe("near");
    const before = last().ratio;
    fireEvent.keyDown(root, { key: "Escape" });
    expect(last().ratio).toBeLessThan(before);
    expect(last().ratio).toBe(1);
  });

  it("never zooms in on Escape from mid when the fitted view is itself mid", () => {
    const { root, last } = renderTracked({ thresholds: { midAt: 0.5, nearAt: 6 } });
    fireEvent.keyDown(root, { key: "-" });
    expect(last().regime).toBe("mid");
    const before = last().ratio;
    expect(before).toBeLessThan(1);
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      root.dispatchEvent(event);
    });
    expect(last().ratio).toBe(before);
    expect(event.defaultPrevented).toBe(false);
  });

  it("prevents the default only for keys it handles", () => {
    const { root } = renderTracked();
    const handled = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    const ignored = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    act(() => {
      root.dispatchEvent(handled);
      root.dispatchEvent(ignored);
    });
    expect(handled.defaultPrevented).toBe(true);
    expect(ignored.defaultPrevented).toBe(false);
  });

  it("handles no key whose target is inside the surface (tree, legend, minimap)", () => {
    const { container, last } = renderTracked({
      spec: {
        ...lineSpec,
        territories: [{ id: "t", name: "T", members: ["n0", "n1"], centroid: [5, 0] }],
        nodes: lineSpec.nodes.map((node) =>
          node.id === "n0" || node.id === "n1" ? { ...node, territory: "t" } : node,
        ),
      },
    });
    const treeButton = container.querySelector("[data-map-surface] button");
    if (!(treeButton instanceof HTMLElement)) throw new Error("expected a tree button");
    const before = last().ratio;
    const event = new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true });
    act(() => {
      treeButton.dispatchEvent(event);
    });
    expect(last().ratio).toBe(before);
    expect(event.defaultPrevented).toBe(false);
  });

  it("shows the focus ring once a key is handled, even after a press", () => {
    const { root } = renderTracked();
    fireEvent.pointerDown(root, { clientX: 10, clientY: 10, pointerId: 1, button: 0, isPrimary: true });
    act(() => root.focus());
    expect(root.hasAttribute("data-focus-visible")).toBe(false);
    fireEvent.keyDown(root, { key: "ArrowUp" });
    expect(root.hasAttribute("data-focus-visible")).toBe(true);
  });

  it("announces the count once, 500 ms after a held arrow key stops", () => {
    vi.useFakeTimers();
    const { root, container, last } = renderTracked();
    const region = () => container.querySelector("[data-count-announcement]")?.textContent ?? "";
    for (let step = 0; step < 30; step += 1) {
      act(() => {
        vi.advanceTimersByTime(30);
      });
      fireEvent.keyDown(root, { key: "ArrowRight" });
      expect(region()).toBe("");
    }
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(region()).toBe("");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const count = last().visibleCount;
    expect(region()).toBe(`${count} ${count === 1 ? "item" : "items"} in view`);
  });

  it("clears the announcement when movement starts again", () => {
    vi.useFakeTimers();
    const { root, container } = renderTracked();
    const region = () => container.querySelector("[data-count-announcement]")?.textContent ?? "";
    fireEvent.keyDown(root, { key: "ArrowRight" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(region()).not.toBe("");
    fireEvent.keyDown(root, { key: "ArrowLeft" });
    expect(region()).toBe("");
  });
});
