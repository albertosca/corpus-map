import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MapSpec } from "../shared/spec";
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

  it("groups un-territoried nodes under an unassigned group", () => {
    render(<AccessibleTree spec={spec} regime="far" viewport={viewport} width={400} height={300} cap={200} />);
    expect(screen.getByText(/Unassigned \(1\)/)).toBeDefined();
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
      nodes: Array.from({ length: 5000 }, (_, i) => ({
        id: `n${i}`,
        label: `N${i}`,
        x: i * 0.001,
        y: 0,
        territory: null,
      })),
    };
    render(<AccessibleTree spec={many} regime="near" viewport={viewport} width={400} height={300} cap={50} />);
    expect(screen.getAllByRole("button").length).toBeLessThanOrEqual(50);
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
});
