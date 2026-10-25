import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { nestedSpec } from "../../test/specs";
import type { MapSpec } from "../shared/spec";
import { deriveTerritoryGroups } from "../territories/groups";
import { AccessibleTree } from "./AccessibleTree";

const spec: MapSpec = {
  version: "1",
  territories: [
    { id: "t1", name: "North", members: ["a", "b"], centroid: [0, 0] },
    { id: "t2", name: "South", members: ["c"], centroid: [5, 5] },
  ],
  nodes: [
    { id: "a", label: "Alpha", x: 0, y: 0, territory: "t1" },
    { id: "b", label: "Beta", x: 1, y: 0, territory: "t1" },
    { id: "c", label: "Gamma", x: 5, y: 5, territory: "t2" },
    { id: "d", label: "Delta", x: 9, y: 9, territory: null },
  ],
};

// scale 10, tx 0, ty 0: every fixture node above lands at screen x,y <= 90,
// comfortably inside this 400x300 viewport.
const viewport = { scale: 10, tx: 0, ty: 0 };

describe("AccessibleTree", () => {
  it("lists territories, not items, at the far regime", () => {
    render(<AccessibleTree spec={spec} regime="far" viewport={viewport} width={400} height={300} cap={200} />);
    expect(screen.getByRole("button", { name: /North/ })).toBeDefined();
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("offers the loose nodes as an Unassigned control at the far regime", async () => {
    const onUnassigned = vi.fn();
    render(
      <AccessibleTree
        spec={spec}
        regime="far"
        viewport={viewport}
        width={400}
        height={300}
        cap={200}
        onUnassigned={onUnassigned}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Unassigned, 1 item" }));
    expect(onUnassigned).toHaveBeenCalledTimes(1);
  });

  it("lists items at the near regime", () => {
    render(<AccessibleTree spec={spec} regime="near" viewport={viewport} width={400} height={300} cap={200} />);
    expect(screen.getByText("Alpha")).toBeDefined();
    expect(screen.getByText("Delta")).toBeDefined();
  });

  it("is reachable by keyboard", async () => {
    const user = userEvent.setup();
    render(<AccessibleTree spec={spec} regime="far" viewport={viewport} width={400} height={300} cap={200} />);
    await user.tab();
    expect(document.activeElement?.textContent).toMatch(/North/);
  });

  it("moves the viewport when a territory is activated", async () => {
    const user = userEvent.setup();
    const onFocusTerritory = vi.fn();
    render(
      <AccessibleTree
        spec={spec}
        regime="far"
        viewport={viewport}
        width={400}
        height={300}
        cap={200}
        onFocusTerritory={onFocusTerritory}
      />,
    );
    await user.click(screen.getByRole("button", { name: /North/ }));
    expect(onFocusTerritory).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
  });

  it("announces the current regime in a live region", () => {
    const { rerender } = render(
      <AccessibleTree spec={spec} regime="far" viewport={viewport} width={400} height={300} cap={200} />,
    );
    rerender(<AccessibleTree spec={spec} regime="near" viewport={viewport} width={400} height={300} cap={200} />);
    expect(screen.getByRole("status").textContent).toMatch(/items/);
  });

  it("announces far to mid distinctly, since the tree's items do not change there", () => {
    const { rerender } = render(
      <AccessibleTree spec={spec} regime="far" viewport={viewport} width={400} height={300} cap={200} />,
    );
    const far = screen.getByRole("status").textContent;
    expect(far).toBe("Showing territories");
    rerender(<AccessibleTree spec={spec} regime="mid" viewport={viewport} width={400} height={300} cap={200} />);
    const mid = screen.getByRole("status").textContent;
    expect(mid).toBe("Showing territories and points");
    expect(mid).not.toBe(far);
  });

  it("near regime lists at most cap items", () => {
    const many: MapSpec = {
      version: "1",
      territories: [],
      nodes: Array.from({ length: 5000 }, (_, index) => ({
        id: `n${index}`,
        label: `N${index}`,
        x: index * 0.001,
        y: 0,
        territory: null,
      })),
    };
    render(<AccessibleTree spec={many} regime="near" viewport={viewport} width={400} height={300} cap={50} />);
    // The cap bounds the items; "Back to overview" is the one control on top of them.
    const items = screen.getAllByRole("button").filter((button) => !button.hasAttribute("data-tree-overview"));
    expect(items.length).toBeLessThanOrEqual(50);
  });

  it("near regime does not list an off-screen node", () => {
    const offscreen: MapSpec = {
      version: "1",
      territories: [],
      nodes: [{ id: "a", label: "Offscreen", x: 100, y: 0, territory: null }],
    };
    render(<AccessibleTree spec={offscreen} regime="near" viewport={viewport} width={400} height={300} cap={200} />);
    expect(screen.queryByText("Offscreen")).toBeNull();
  });

  it("names territory buttons with an item count, singular for one", () => {
    render(<AccessibleTree spec={spec} regime="mid" viewport={viewport} width={400} height={300} cap={200} />);
    expect(screen.getByRole("button", { name: "North, 2 items" })).toBeDefined();
    expect(screen.getByRole("button", { name: "South, 1 item" })).toBeDefined();
  });

  it("puts territories under group headings at the requested level, in group order", () => {
    const groups = [
      { id: "group:t2", name: "Southern", members: ["t2"] },
      { id: "group:t1", name: "Northern", members: ["t1"] },
    ];
    render(
      <AccessibleTree
        spec={spec}
        regime="far"
        viewport={viewport}
        width={400}
        height={300}
        cap={200}
        groups={groups}
        heading="h4"
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 4 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["Southern", "Northern"]);
    const names = screen.getAllByRole("button").map((button) => button.textContent);
    expect(names).toEqual(["South, 1 item", "North, 2 items", "Unassigned, 1 item"]);
  });

  it("lists territories flat, with no headings, when there are no groups", () => {
    render(<AccessibleTree spec={spec} regime="far" viewport={viewport} width={400} height={300} cap={200} />);
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
  });

  it("leaves dimmed territories out, and a group whose members are all dimmed", () => {
    const groups = [
      { id: "group:t1", name: "Northern", members: ["t1"] },
      { id: "group:t2", name: "Southern", members: ["t2"] },
    ];
    render(
      <AccessibleTree
        spec={spec}
        regime="far"
        viewport={viewport}
        width={400}
        height={300}
        cap={200}
        groups={groups}
        hidden={new Set(["t1"])}
      />,
    );
    expect(screen.queryByRole("button", { name: /North/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Northern" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Southern" })).toBeDefined();
  });

  it("orders the near sections by group order, as the far tree and the legend do", () => {
    const groups = [
      { id: "group:t2", name: "Southern", members: ["t2"] },
      { id: "group:t1", name: "Northern", members: ["t1"] },
    ];
    render(
      <AccessibleTree
        spec={spec}
        regime="near"
        viewport={viewport}
        width={400}
        height={300}
        cap={200}
        groups={groups}
      />,
    );
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "South",
      "North",
      "Unassigned",
    ]);
  });

  it("leads the near list with Back to overview, then items under territory headings, Unassigned last", async () => {
    const onOverview = vi.fn();
    render(
      <AccessibleTree
        spec={spec}
        regime="near"
        viewport={viewport}
        width={400}
        height={300}
        cap={200}
        onOverview={onOverview}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]?.textContent).toBe("Back to overview");
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "North",
      "South",
      "Unassigned",
    ]);
    expect(buttons.slice(1).map((button) => button.textContent)).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
    await userEvent.click(buttons[0] as HTMLElement);
    expect(onOverview).toHaveBeenCalledTimes(1);
  });

  it("caps the near items across all lists", () => {
    render(<AccessibleTree spec={spec} regime="near" viewport={viewport} width={400} height={300} cap={2} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("moves focus to Back to overview when the focused territory button unmounts into near", () => {
    const { rerender } = render(
      <AccessibleTree spec={spec} regime="far" viewport={viewport} width={400} height={300} cap={200} />,
    );
    act(() => screen.getByRole("button", { name: "North, 2 items" }).focus());
    rerender(<AccessibleTree spec={spec} regime="near" viewport={viewport} width={400} height={300} cap={200} />);
    expect(document.activeElement?.textContent).toBe("Back to overview");
  });

  it("returns focus to the territory the reader came from when leaving near", async () => {
    const { rerender } = render(
      <AccessibleTree spec={spec} regime="far" viewport={viewport} width={400} height={300} cap={200} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "South, 1 item" }));
    rerender(<AccessibleTree spec={spec} regime="near" viewport={viewport} width={400} height={300} cap={200} />);
    rerender(<AccessibleTree spec={spec} regime="far" viewport={viewport} width={400} height={300} cap={200} />);
    expect(document.activeElement?.textContent).toBe("South, 1 item");
  });

  it("does not take focus back after the reader moved it out of the tree", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    const { rerender } = render(
      <AccessibleTree spec={spec} regime="far" viewport={viewport} width={400} height={300} cap={200} />,
    );
    act(() => screen.getByRole("button", { name: "North, 2 items" }).focus());
    act(() => outside.focus());
    act(() => outside.blur());
    rerender(<AccessibleTree spec={spec} regime="near" viewport={viewport} width={400} height={300} cap={200} />);
    expect(document.activeElement).toBe(document.body);
    outside.remove();
  });

  it("does not take focus back after a click on plain page content sent focus to body", async () => {
    const { rerender } = render(
      <AccessibleTree spec={spec} regime="far" viewport={viewport} width={400} height={300} cap={200} />,
    );
    const button = screen.getByRole("button", { name: "North, 2 items" });
    act(() => button.focus());
    // A click on non-focusable text blurs with no relatedTarget while the button stays mounted.
    await act(async () => button.blur());
    rerender(<AccessibleTree spec={spec} regime="near" viewport={viewport} width={400} height={300} cap={200} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("calls the fallback when the new tree has nothing to focus", () => {
    const onFocusFallback = vi.fn();
    const territoriesOnly: MapSpec = { ...spec, nodes: spec.nodes.filter((node) => node.territory !== null) };
    const { rerender } = render(
      <AccessibleTree
        spec={territoriesOnly}
        regime="far"
        viewport={viewport}
        width={400}
        height={300}
        cap={200}
        onFocusFallback={onFocusFallback}
      />,
    );
    act(() => screen.getByRole("button", { name: "North, 2 items" }).focus());
    rerender(
      <AccessibleTree
        spec={territoriesOnly}
        regime="far"
        viewport={viewport}
        width={400}
        height={300}
        cap={200}
        hidden={new Set(["t1", "t2"])}
        onFocusFallback={onFocusFallback}
      />,
    );
    expect(onFocusFallback).toHaveBeenCalledTimes(1);
  });

  it("shows Back to overview on screen while it has focus, hidden otherwise", () => {
    render(<AccessibleTree spec={spec} regime="near" viewport={viewport} width={400} height={300} cap={200} />);
    const overview = screen.getByRole("button", { name: "Back to overview" });
    // jsdom serialises `rect(0 0 0 0)` as `rect(0px)`, so the hidden state is read from the 1px box.
    expect(overview.style.width).toBe("1px");
    expect(overview.style.clip).not.toBe("");
    act(() => overview.focus());
    expect(overview.style.width).toBe("");
    expect(overview.style.clip).toBe("");
    expect(overview.style.outline).toContain("solid");
  });
});

describe("AccessibleTree: declared parents", () => {
  it("lists the leaves under their parent's heading and never the parent as a territory", () => {
    const nested = nestedSpec();
    render(
      <AccessibleTree
        spec={nested}
        regime="far"
        viewport={viewport}
        width={400}
        height={300}
        cap={200}
        groups={deriveTerritoryGroups(nested)}
      />,
    );
    expect(screen.getByRole("heading", { name: "Parent" })).toBeDefined();
    expect(screen.getByRole("button", { name: "A, 6 items" })).toBeDefined();
    expect(screen.getByRole("button", { name: "B, 6 items" })).toBeDefined();
    expect(screen.queryByRole("button", { name: /Parent/ })).toBeNull();
  });

  it("never lists the parent in a tree without groups", () => {
    const nested = nestedSpec();
    render(<AccessibleTree spec={nested} regime="far" viewport={viewport} width={400} height={300} cap={200} />);
    expect(screen.queryByRole("button", { name: /Parent/ })).toBeNull();
  });
});
