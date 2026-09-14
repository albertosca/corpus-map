import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccessibleTree } from "../src/react/AccessibleTree";
import type { MapSpec } from "../src/spec";

// vitest.config.ts does not set `test.globals: true`, so
// @testing-library/react's automatic afterEach(cleanup) never registers
// (it detects a global `afterEach`, which only exists under `globals: true`).
// Without this, DOM from one test leaks into the next within this file,
// since these assertions query the whole document via `screen` rather than
// a per-render `container`.
afterEach(() => {
  cleanup();
});

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

describe("AccessibleTree", () => {
  it("lists territories, not items, at the far regime", () => {
    render(<AccessibleTree spec={spec} regime="far" />);
    expect(screen.getByRole("button", { name: /North/ })).toBeDefined();
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("groups un-territoried nodes under an unassigned group", () => {
    render(<AccessibleTree spec={spec} regime="far" />);
    expect(screen.getByRole("button", { name: /Unassigned/i })).toBeDefined();
  });

  it("lists items at the near regime", () => {
    render(<AccessibleTree spec={spec} regime="near" />);
    expect(screen.getByText("Alpha")).toBeDefined();
    expect(screen.getByText("Delta")).toBeDefined();
  });

  it("is reachable by keyboard", async () => {
    const user = userEvent.setup();
    render(<AccessibleTree spec={spec} regime="far" />);
    await user.tab();
    expect(document.activeElement?.textContent).toMatch(/North/);
  });

  it("moves the viewport when a territory is activated", async () => {
    const user = userEvent.setup();
    const onFocusTerritory = vi.fn();
    render(<AccessibleTree spec={spec} regime="far" onFocusTerritory={onFocusTerritory} />);
    await user.click(screen.getByRole("button", { name: /North/ }));
    expect(onFocusTerritory).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
  });

  it("announces the current regime in a live region", () => {
    const { rerender } = render(<AccessibleTree spec={spec} regime="far" />);
    rerender(<AccessibleTree spec={spec} regime="near" />);
    expect(screen.getByRole("status").textContent).toMatch(/recipes|items|near/i);
  });
});
