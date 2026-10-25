import { fireEvent, render, screen, within } from "@testing-library/react";
import type { MapNode } from "corpus-map";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
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

  it("shows a non-arXiv node's meta fields as a definition list, no arXiv link", () => {
    renderWithReturnTarget(ELEMENT_NODE, { isArxiv: false, territoryName: "Nonmetal" });
    expect(screen.queryByRole("link", { name: "Open on arXiv" })).toBeNull();
    expect(screen.queryByText(/^Published /)).toBeNull();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Hydrogen")).not.toBeNull();
    expect(within(dialog).getByText("1")).not.toBeNull();
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
