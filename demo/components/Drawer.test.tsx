import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { MapNode } from "corpus-map";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auditAccessibility, violationIds } from "../../test/audit";
import { Drawer } from "./Drawer";

const ARXIV_NODE: MapNode = {
  id: "2609.26779",
  label: "CliffCompaction: Cost-Efficient Compaction for Long-Horizon Coding Agents",
  x: 0,
  y: 0,
  territory: "cs.AI",
  meta: { year: 2026, url: "https://arxiv.org/abs/2609.26779" },
};

const ELEMENT_NODE: MapNode = {
  id: "h",
  label: "H",
  x: 0,
  y: 0,
  territory: "nonmetal",
  meta: { name: "Hydrogen", atomicNumber: 1 },
};

/** A focusable element standing in for the demo's map surface, to assert focus returns to it. */
function renderWithReturnTarget(node: MapNode | null, extra: Partial<Parameters<typeof Drawer>[0]> = {}) {
  const returnFocusTo = createRef<HTMLButtonElement>();
  const onClose = vi.fn();
  const rendered = render(
    <>
      <button type="button" ref={returnFocusTo}>
        map surface stand-in
      </button>
      <Drawer
        node={node}
        territoryName={null}
        isArxiv={false}
        onClose={onClose}
        returnFocusTo={returnFocusTo}
        related={[]}
        onOpenRelated={vi.fn()}
        {...extra}
      />
    </>,
  );
  return { ...rendered, returnFocusTo, onClose };
}

describe("Drawer (showcase Task 6)", () => {
  it("passes the accessibility audit while open, related items included", async () => {
    const { container } = renderWithReturnTarget(ARXIV_NODE, {
      isArxiv: true,
      territoryName: "Artificial Intelligence",
      related: [{ node: ELEMENT_NODE, weight: 0.9, reason: "gui" }],
    });
    expect(violationIds(await auditAccessibility(container))).toEqual([]);
  });

  it("renders nothing until a node is selected", () => {
    const { container } = renderWithReturnTarget(null);
    expect(screen.queryByRole("dialog")).toBeNull();
    // Only the return-focus stand-in button should be present.
    expect(container.querySelectorAll("[data-drawer]").length).toBe(0);
  });

  it("opens with the exact label as its accessible dialog name", () => {
    renderWithReturnTarget(ARXIV_NODE, { isArxiv: true, territoryName: "Artificial Intelligence" });
    const dialog = screen.getByRole("dialog", {
      name: "CliffCompaction: Cost-Efficient Compaction for Long-Horizon Coding Agents",
    });
    expect(dialog).not.toBeNull();
  });

  it("for arXiv, shows the published year, the territory's full name, and the arXiv link with target and rel", () => {
    renderWithReturnTarget(ARXIV_NODE, { isArxiv: true, territoryName: "Artificial Intelligence" });
    expect(screen.getByText("Published 2026")).not.toBeNull();
    expect(screen.getByText("Artificial Intelligence")).not.toBeNull();

    const link = screen.getByRole("link", { name: "Open on arXiv" });
    expect(link.getAttribute("href")).toBe("https://arxiv.org/abs/2609.26779");
    expect(link.getAttribute("target")).toBe("_blank");
    // Revert-check target: dropping `rel` (or weakening it) must fail this assertion.
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("for arXiv, shows the paper's arXiv category with its code right under the year", () => {
    const node: MapNode = {
      ...ARXIV_NODE,
      meta: {
        year: 2026,
        url: "https://arxiv.org/abs/2609.26779",
        category: { id: "cs.AI", name: "Artificial Intelligence" },
      },
    };
    renderWithReturnTarget(node, { isArxiv: true, territoryName: "Agents and Planning" });
    const year = screen.getByText("Published 2026");
    expect(year.nextElementSibling?.textContent).toBe("arXiv category: Artificial Intelligence (cs.AI)");
  });

  it.each([undefined, { id: "cs.AI" }, "cs.AI"])(
    "for arXiv, shows no category line for a category of %j",
    (category) => {
      const node: MapNode = { ...ARXIV_NODE, meta: { year: 2026, url: "https://arxiv.org/abs/2609.26779", category } };
      renderWithReturnTarget(node, { isArxiv: true, territoryName: "Agents and Planning" });
      expect(screen.queryByText(/^arXiv category:/)).toBeNull();
    },
  );

  it("shows a non-arXiv node's meta fields as a definition list, no arXiv link", () => {
    renderWithReturnTarget(ELEMENT_NODE, { isArxiv: false, territoryName: "Nonmetal" });
    expect(screen.queryByRole("link", { name: "Open on arXiv" })).toBeNull();
    expect(screen.queryByText(/^Published /)).toBeNull();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Hydrogen")).not.toBeNull();
    expect(within(dialog).getByText("1")).not.toBeNull();
  });

  it("leaves focus on the map surface when a keyboard walk there changes the node", () => {
    const { returnFocusTo, rerender, onClose } = renderWithReturnTarget(ARXIV_NODE, {
      isArxiv: true,
      territoryName: "Artificial Intelligence",
    });
    returnFocusTo.current?.focus();
    rerender(
      <>
        <button type="button" ref={returnFocusTo}>
          map surface stand-in
        </button>
        <Drawer
          node={ELEMENT_NODE}
          territoryName={null}
          isArxiv={false}
          onClose={onClose}
          returnFocusTo={returnFocusTo}
          related={[]}
          onOpenRelated={vi.fn()}
        />
      </>,
    );
    expect(document.activeElement).toBe(returnFocusTo.current);
  });

  it("clicking the close button closes and returns focus to the map surface", () => {
    const { onClose, returnFocusTo } = renderWithReturnTarget(ARXIV_NODE, {
      isArxiv: true,
      territoryName: "Artificial Intelligence",
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(returnFocusTo.current);
  });

  it("Escape closes and returns focus to the map surface", () => {
    // Revert-check target #2: dropping the focus-return call must fail this assertion
    // even though `onClose` still fires.
    const { onClose, returnFocusTo } = renderWithReturnTarget(ARXIV_NODE, {
      isArxiv: true,
      territoryName: "Artificial Intelligence",
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(returnFocusTo.current);
  });

  it("a key other than Escape does not close the drawer", () => {
    const { onClose } = renderWithReturnTarget(ARXIV_NODE, { isArxiv: true, territoryName: "Artificial Intelligence" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("updates in place when a different node is selected while open, without closing", () => {
    const { rerender, onClose } = renderWithReturnTarget(ARXIV_NODE, {
      isArxiv: true,
      territoryName: "Artificial Intelligence",
    });
    expect(screen.getByRole("dialog", { name: ARXIV_NODE.label })).not.toBeNull();

    const returnFocusTo = createRef<HTMLButtonElement>();
    rerender(
      <>
        <button type="button" ref={returnFocusTo}>
          map surface stand-in
        </button>
        <Drawer
          node={ELEMENT_NODE}
          territoryName="Nonmetal"
          isArxiv={false}
          onClose={onClose}
          returnFocusTo={returnFocusTo}
          related={[]}
          onOpenRelated={vi.fn()}
        />
      </>,
    );

    expect(screen.queryByRole("dialog", { name: ARXIV_NODE.label })).toBeNull();
    expect(screen.getByRole("dialog", { name: ELEMENT_NODE.label })).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("is marked as a floating control", () => {
    const { container } = renderWithReturnTarget(ARXIV_NODE, {
      isArxiv: true,
      territoryName: "Artificial Intelligence",
    });
    const drawer = container.querySelector("[data-drawer]");
    expect(drawer?.hasAttribute("data-floating-control")).toBe(true);
  });

  it("is a non-modal dialog (aria-modal is false)", () => {
    renderWithReturnTarget(ARXIV_NODE, { isArxiv: true, territoryName: "Artificial Intelligence" });
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("false");
  });

  describe("guards meta.url before it becomes a live href (review fix round 1)", () => {
    it("renders no link for a javascript: URL — the rest of the drawer still shows", () => {
      const node: MapNode = { ...ARXIV_NODE, meta: { year: 2026, url: "javascript:alert(1)" } };
      renderWithReturnTarget(node, { isArxiv: true, territoryName: "Artificial Intelligence" });
      expect(screen.queryByRole("link", { name: "Open on arXiv" })).toBeNull();
      expect(screen.getByRole("dialog", { name: node.label })).not.toBeNull();
      expect(screen.getByText("Published 2026")).not.toBeNull();
      expect(screen.getByText("Artificial Intelligence")).not.toBeNull();
    });

    it("renders no link for an http:// (non-arXiv-abs) URL — the rest of the drawer still shows", () => {
      const node: MapNode = { ...ARXIV_NODE, meta: { year: 2026, url: "http://evil.example.com/abs/2609.26779" } };
      renderWithReturnTarget(node, { isArxiv: true, territoryName: "Artificial Intelligence" });
      expect(screen.queryByRole("link", { name: "Open on arXiv" })).toBeNull();
      expect(screen.getByRole("dialog", { name: node.label })).not.toBeNull();
      expect(screen.getByText("Published 2026")).not.toBeNull();
    });

    it("still renders the link for a genuine https://arxiv.org/abs/ URL", () => {
      renderWithReturnTarget(ARXIV_NODE, { isArxiv: true, territoryName: "Artificial Intelligence" });
      const link = screen.getByRole("link", { name: "Open on arXiv" });
      expect(link.getAttribute("href")).toBe("https://arxiv.org/abs/2609.26779");
    });
  });

  describe("Related (slice E)", () => {
    const NEIGHBOUR: MapNode = { ...ARXIV_NODE, id: "2609.00001", label: "Compaction for Agents", territory: "cs.SE" };
    const OTHER: MapNode = { ...ARXIV_NODE, id: "2609.00002", label: "Long-Horizon Planning", territory: "cs.RO" };

    it("lists each related item as a button with its reason, and opens it on press", () => {
      const onOpenRelated = vi.fn();
      renderWithReturnTarget(ARXIV_NODE, {
        isArxiv: true,
        related: [
          { node: NEIGHBOUR, weight: 0.9, reason: "compaction, agents" },
          { node: OTHER, weight: 0.8, reason: undefined },
        ],
        onOpenRelated,
      });
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByRole("heading", { name: "Related" })).not.toBeNull();
      const list = within(dialog).getByRole("list");
      const buttons = within(list).getAllByRole("button");
      expect(buttons).toHaveLength(2);
      expect(buttons[0]?.textContent).toContain("Compaction for Agents");
      expect(buttons[0]?.textContent).toContain("compaction, agents");
      expect(buttons[0]?.style.maxWidth).toBe("100%");
      fireEvent.click(buttons[1] as HTMLElement);
      expect(onOpenRelated).toHaveBeenCalledWith("2609.00002");
    });

    it("shows no Related section when the item has none", () => {
      renderWithReturnTarget(ARXIV_NODE, { isArxiv: true });
      expect(screen.queryByRole("heading", { name: "Related" })).toBeNull();
    });
  });
});

describe("Drawer side layout styles (spec mobile §6: unchanged)", () => {
  it("keeps today's inline styles", () => {
    const { container } = renderWithReturnTarget(ARXIV_NODE, {
      isArxiv: true,
      territoryName: "Artificial Intelligence",
      topInset: 48,
      related: [{ node: ELEMENT_NODE, weight: 0.9, reason: "gui" }],
    });
    const drawer = container.querySelector("[data-drawer]") as HTMLElement;
    const styles = [drawer, ...drawer.querySelectorAll<HTMLElement>("[style]")].map((element) =>
      element.getAttribute("style"),
    );
    expect(drawer.className).toBe("cm-drawer-panel");
    expect(styles).toMatchInlineSnapshot(`
      [
        "position: fixed; top: 48px; right: 0px; bottom: 0px; width: 90vw; max-width: 320px; z-index: 20; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding: 16px 18px; background: var(--surface-solid); border-left: 1px solid var(--border); box-shadow: -2px 0 10px var(--shadow); color: var(--text); font-size: 14px;",
        "display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;",
        "margin: 0px; font-size: 16px; font-weight: 600; line-height: 1.35;",
        "flex-shrink: 0; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); font-size: 13px; max-width: 100%;",
        "margin: 0px;",
        "margin: 0px;",
        "margin: 0px;",
        "color: var(--link);",
        "margin: 6px 0px 0px; font-size: 14px; font-weight: 600;",
        "margin: 0px; padding: 0px; list-style: none; display: flex; flex-direction: column; gap: 6px;",
        "display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; max-width: 100%; padding: 6px 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; text-align: left; cursor: pointer;",
        "color: var(--text-muted); font-size: 12px;",
      ]
    `);
  });
});

describe("Drawer sheet layout (spec mobile §6)", () => {
  const WINDOW_HEIGHT = 800;
  const TOP = 56;
  // Collapsed: the sheet spans from the top inset to the bottom, shifted down so 40% of the window shows.
  const COLLAPSED_SHIFT = WINDOW_HEIGHT - TOP - 320;
  const original = window.innerHeight;
  let frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    window.innerHeight = WINDOW_HEIGHT;
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
  });
  afterEach(() => {
    window.innerHeight = original;
    vi.restoreAllMocks();
  });

  function flushFrames(): void {
    act(() => {
      const pending = frames;
      frames = [];
      for (const callback of pending) callback(performance.now());
    });
  }

  function sheet(extra: Partial<Parameters<typeof Drawer>[0]> = {}) {
    const rendered = renderWithReturnTarget(ARXIV_NODE, {
      isArxiv: true,
      territoryName: "Artificial Intelligence",
      layout: "sheet",
      topInset: TOP,
      related: [{ node: ELEMENT_NODE, weight: 0.9, reason: "gui" }],
      ...extra,
    });
    const panel = rendered.container.querySelector("[data-drawer]") as HTMLElement;
    const handle = rendered.container.querySelector("[data-sheet-handle]") as HTMLElement;
    return { ...rendered, panel, handle };
  }

  const touch = { pointerId: 7, pointerType: "touch", button: 0 };
  function drag(handle: HTMLElement, start: number, end: number): void {
    fireEvent.pointerDown(handle, { ...touch, clientX: 100, clientY: start });
    fireEvent.pointerMove(handle, { ...touch, clientX: 100, clientY: end });
    fireEvent.pointerUp(handle, { ...touch, clientX: 100, clientY: end });
    // The browser follows a press and release on the same button with a click.
    fireEvent.click(handle);
  }

  it("spans the width on the bottom edge, from the top inset, collapsed to 40% of the window", () => {
    const { panel } = sheet();
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.left).toBe("0px");
    expect(panel.style.right).toBe("0px");
    expect(panel.style.bottom).toBe("0px");
    expect(panel.style.top).toBe(`${TOP}px`);
    expect(panel.style.maxWidth).toBe("100vw");
    expect(panel.style.overflowY).toBe("auto");
    expect(panel.style.transform).toBe("translateY(calc(100% - 320px))");
    expect(panel.getAttribute("data-sheet-state")).toBe("collapsed");
  });

  it("has a 44 px handle button that expands and collapses on a tap", () => {
    const { panel, handle } = sheet();
    expect(handle.tagName).toBe("BUTTON");
    expect(handle.getAttribute("aria-label")).toBe("Expand details");
    expect(handle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(handle);
    expect(handle.getAttribute("aria-label")).toBe("Collapse details");
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.style.transform).toBe("none");
    expect(panel.getAttribute("data-sheet-state")).toBe("expanded");
    fireEvent.click(handle);
    expect(handle.getAttribute("aria-expanded")).toBe("false");
  });

  it("gives every button in the sheet a 44 px minimum height", () => {
    const { panel } = sheet();
    const buttons = [...panel.querySelectorAll<HTMLElement>("button")];
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    for (const button of buttons) expect(Number.parseFloat(button.style.minHeight)).toBeGreaterThanOrEqual(44);
  });

  it("expands when the handle is dragged up past the midpoint and released", () => {
    const { handle } = sheet();
    drag(handle, 500, 500 - COLLAPSED_SHIFT / 2 - 10);
    expect(handle.getAttribute("aria-expanded")).toBe("true");
  });

  it("snaps back when the drag stops short of the midpoint", () => {
    const { handle, panel } = sheet();
    drag(handle, 500, 500 - COLLAPSED_SHIFT / 2 + 10);
    expect(handle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.style.transform).toBe("translateY(calc(100% - 320px))");
  });

  it("toggles like a tap when the press does not move", () => {
    const { handle } = sheet();
    drag(handle, 500, 500);
    expect(handle.getAttribute("aria-expanded")).toBe("true");
  });

  it("follows the finger once per frame and never above the expanded top", () => {
    const { handle, panel } = sheet();
    fireEvent.pointerDown(handle, { ...touch, clientX: 100, clientY: 500 });
    fireEvent.pointerMove(handle, { ...touch, clientX: 100, clientY: 450 });
    fireEvent.pointerMove(handle, { ...touch, clientX: 100, clientY: 400 });
    expect(frames).toHaveLength(1);
    flushFrames();
    expect(panel.style.transform).toBe(`translateY(${COLLAPSED_SHIFT - 100}px)`);
    fireEvent.pointerMove(handle, { ...touch, clientX: 100, clientY: -2000 });
    flushFrames();
    expect(panel.style.transform).toBe("translateY(0px)");
    fireEvent.pointerUp(handle, { ...touch, clientX: 100, clientY: -2000 });
    expect(panel.style.transform).toBe("none");
  });

  it("closes, returning focus to the map, when dragged down from collapsed by more than half its height", () => {
    const { handle, onClose, returnFocusTo } = sheet();
    drag(handle, 500, 500 + 161);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(returnFocusTo.current);
  });

  it("stays open when dragged down from collapsed by less than half its height", () => {
    const { handle, onClose } = sheet();
    drag(handle, 500, 500 + 159);
    expect(onClose).not.toHaveBeenCalled();
    expect(handle.getAttribute("aria-expanded")).toBe("false");
  });

  it("still closes on Close and on Escape, returning focus to the map", () => {
    const first = sheet();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(first.onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(first.returnFocusTo.current);
    first.unmount();
    const second = sheet();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(second.onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(second.returnFocusTo.current);
  });

  it("opens collapsed again after a close", () => {
    const { handle, rerender, returnFocusTo, onClose } = sheet();
    fireEvent.click(handle);
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    const element = (node: MapNode | null) => (
      <>
        <button type="button" ref={returnFocusTo}>
          map surface stand-in
        </button>
        <Drawer
          node={node}
          territoryName={null}
          isArxiv={false}
          onClose={onClose}
          returnFocusTo={returnFocusTo}
          related={[]}
          onOpenRelated={vi.fn()}
          layout="sheet"
          topInset={TOP}
        />
      </>
    );
    rerender(element(null));
    rerender(element(ELEMENT_NODE));
    expect(screen.getByRole("button", { name: "Expand details" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("is controlled when `expanded` is passed, reporting each request", () => {
    const onExpandedChange = vi.fn();
    const { handle } = sheet({ expanded: true, onExpandedChange });
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(handle);
    expect(onExpandedChange).toHaveBeenCalledWith(false);
    expect(handle.getAttribute("aria-expanded")).toBe("true");
  });

  it("animates the transform, unless the reader asked for reduced motion", () => {
    const { panel, unmount } = sheet();
    expect(panel.style.transition).toContain("transform");
    unmount();
    // jsdom has no matchMedia: define one for this test only.
    vi.stubGlobal(
      "matchMedia",
      (query: string) => ({ matches: query.includes("reduce"), media: query }) as MediaQueryList,
    );
    try {
      const reduced = sheet();
      expect(reduced.panel.style.transition).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("passes the accessibility audit", async () => {
    const { container } = sheet();
    expect(violationIds(await auditAccessibility(container))).toEqual([]);
  });
});
